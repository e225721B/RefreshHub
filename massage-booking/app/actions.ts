"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { weekdaysFrom } from "@/lib/dates";
import {
  CLEANUP_MIN,
  TREATMENT_OPTIONS,
  getAvailableSlots,
  isStillAvailable,
  toHHMM,
  toMinutes,
  type Gender,
  type Slot,
} from "@/lib/slots";

/** 入力値の検証。フォームは誰でも直接呼べるため、サーバ側で必ず確かめる。 */
function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}
function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}
function isValidTreatment(min: number): boolean {
  return (TREATMENT_OPTIONS as readonly number[]).includes(min);
}
function normalizeGenders(genders: string[] | undefined): Gender[] {
  if (!genders) return [];
  return genders.filter((g): g is Gender => g === "female" || g === "male");
}

/** 1 日ぶんの空き枠を返す */
async function slotsForDate(
  date: string,
  treatmentMin: number,
  genders: Gender[],
): Promise<Slot[]> {
  const [shifts, beds, therapists, reservations] = await Promise.all([
    prisma.shift.findMany({ where: { date } }),
    prisma.bed.findMany({ orderBy: { id: "asc" } }),
    prisma.therapist.findMany(),
    prisma.reservation.findMany({ where: { date } }),
  ]);
  return getAvailableSlots({ shifts, beds, therapists, reservations, treatmentMin, genders });
}

/**
 * 週表示のためのデータ。
 * 施術時間は画面のドラッグで決まるため、15 / 30 / 45 分すべてぶんの空き状況を
 * まとめて返す。日付 → 施術時間 → 開始時刻 → 空き枠、の順で引ける。
 * （AC-1 / AC-3 / AC-4）
 */
export type WeekAvailability = Record<string, Record<number, Record<string, Slot>>>;

export async function fetchWeekAvailability(
  mondayStr: string,
  genders: string[],
): Promise<WeekAvailability> {
  if (!isValidDate(mondayStr)) return {};
  const normalized = normalizeGenders(genders);
  const dates = weekdaysFrom(mondayStr);

  const perDay = await Promise.all(
    dates.map(async (date) => {
      const byTreatment: Record<number, Record<string, Slot>> = {};
      for (const treatmentMin of TREATMENT_OPTIONS) {
        const slots = await slotsForDate(date, treatmentMin, normalized);
        const byTime: Record<string, Slot> = {};
        for (const slot of slots) byTime[slot.startTime] = slot;
        byTreatment[treatmentMin] = byTime;
      }
      return byTreatment;
    }),
  );

  const result: WeekAvailability = {};
  dates.forEach((date, i) => {
    result[date] = perDay[i];
  });
  return result;
}

export type ReserveResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/** 予約を保存する（AC-2） */
export async function createReservation(input: {
  userName: string;
  date: string;
  startTime: string;
  treatmentMin: number;
  bedId: string;
  therapistId: string;
}): Promise<ReserveResult> {
  const userName = input.userName.trim();
  if (!userName) return { ok: false, message: "お名前を入力してください" };
  if (userName.length > 50) return { ok: false, message: "お名前が長すぎます" };
  if (!isValidDate(input.date)) return { ok: false, message: "日付が正しくありません" };
  if (!isValidTime(input.startTime)) return { ok: false, message: "時刻が正しくありません" };
  if (!isValidTreatment(input.treatmentMin)) {
    return { ok: false, message: "施術時間が正しくありません" };
  }

  const blockEndTime = toHHMM(toMinutes(input.startTime) + input.treatmentMin + CLEANUP_MIN);

  // 一覧を見てから予約するまでの間に、他の人が同じ枠を取っている可能性がある。
  // 保存の直前にもう一度確かめる。
  const reservations = await prisma.reservation.findMany({ where: { date: input.date } });
  if (
    !isStillAvailable({
      reservations,
      bedId: input.bedId,
      therapistId: input.therapistId,
      startTime: input.startTime,
      blockEndTime,
    })
  ) {
    return { ok: false, message: "たった今この枠は埋まりました。表を更新します" };
  }

  await prisma.reservation.create({
    data: {
      userName,
      date: input.date,
      startTime: input.startTime,
      treatmentMin: input.treatmentMin,
      blockEndTime,
      bedId: input.bedId,
      therapistId: input.therapistId,
    },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `${input.date} ${input.startTime}〜${blockEndTime} に予約しました（施術 ${input.treatmentMin} 分）`,
  };
}
