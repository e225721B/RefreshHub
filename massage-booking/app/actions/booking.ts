"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { hhmmOfLocal, toDateTime, weekdaysFrom } from "@/lib/dates";
import {
  CLEANUP_MIN,
  TREATMENT_OPTIONS,
  getAvailableSlots,
  isStillAvailable,
  resolveShiftsForDate,
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

/** その日の 00:00 〜 翌日 00:00（ローカル時刻） */
function dayRange(date: string): { start: Date; end: Date } {
  const start = toDateTime(date, "00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** 1 日ぶんの空き枠を返す */
async function slotsForDate(
  date: string,
  treatmentMin: number,
  genders: Gender[],
): Promise<Slot[]> {
  const { start, end } = dayRange(date);
  const [therapists, workHours, absences, beds, reservations] = await Promise.all([
    prisma.therapist.findMany({ where: { active: true }, include: { user: true } }),
    prisma.therapistWorkHours.findMany(),
    prisma.therapistAbsence.findMany(),
    prisma.bed.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.reservation.findMany({
      where: { status: "booked", startAt: { gte: start, lt: end } },
    }),
  ]);

  const shifts = resolveShiftsForDate({ date, therapists, workHours, absences });
  const reservationWindows = reservations.map((r) => ({
    bedId: r.bedId,
    therapistId: r.therapistId,
    startTime: hhmmOfLocal(r.startAt),
    blockEndTime: hhmmOfLocal(r.endAt),
  }));

  return getAvailableSlots({
    shifts,
    beds,
    // 性別は User が持つ（利用者・管理者も選べるため）。未設定なら性別での絞り込みには出てこない
    therapists: therapists.map((t) => ({ id: t.id, name: t.user.name, gender: t.user.gender ?? "" })),
    reservations: reservationWindows,
    treatmentMin,
    genders,
  });
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

/**
 * 予約を保存する（AC-2）。
 *
 * 暫定: ログイン機能（A-1）が入るまでの橋渡しとして、利用者は userId を直接指定する
 * （画面側は listActiveUsersForBooking() の一覧から選ぶ）。
 * ログインが入ったら B-1 で「ログイン中のユーザーで予約する」に置き換える。
 */
export async function createReservation(input: {
  userId: string;
  date: string;
  startTime: string;
  treatmentMin: number;
  bedId: string;
  therapistId: string;
}): Promise<ReserveResult> {
  if (!input.userId) return { ok: false, message: "利用者を選んでください" };
  if (!isValidDate(input.date)) return { ok: false, message: "日付が正しくありません" };
  if (!isValidTime(input.startTime)) return { ok: false, message: "時刻が正しくありません" };
  if (!isValidTreatment(input.treatmentMin)) {
    return { ok: false, message: "施術時間が正しくありません" };
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || !user.active) return { ok: false, message: "利用者が見つかりません" };

  const blockEndTime = toHHMM(toMinutes(input.startTime) + input.treatmentMin + CLEANUP_MIN);

  // 一覧を見てから予約するまでの間に、他の人が同じ枠を取っている可能性がある。
  // 保存の直前にもう一度確かめる。
  const { start, end } = dayRange(input.date);
  const reservations = await prisma.reservation.findMany({
    where: { status: "booked", startAt: { gte: start, lt: end } },
  });
  const reservationWindows = reservations.map((r) => ({
    bedId: r.bedId,
    therapistId: r.therapistId,
    startTime: hhmmOfLocal(r.startAt),
    blockEndTime: hhmmOfLocal(r.endAt),
  }));
  if (
    !isStillAvailable({
      reservations: reservationWindows,
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
      userId: input.userId,
      bedId: input.bedId,
      therapistId: input.therapistId,
      startAt: toDateTime(input.date, input.startTime),
      treatmentMin: input.treatmentMin,
      endAt: toDateTime(input.date, blockEndTime),
    },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `${input.date} ${input.startTime}〜${blockEndTime} に予約しました（施術 ${input.treatmentMin} 分）`,
  };
}

/**
 * 暫定: ログイン機能（A-1）が入るまでの橋渡し。
 * 本来は getCurrentUser()（lib/session.ts）でログイン中の利用者を使う。
 * それまでの間、予約画面から利用者を選べるようにするための一覧。
 */
export async function listActiveUsersForBooking(): Promise<{ id: string; name: string }[]> {
  const users = await prisma.user.findMany({
    where: { active: true, role: "user" },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: u.name }));
}
