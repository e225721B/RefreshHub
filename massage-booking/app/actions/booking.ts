"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { hhmmOfLocal, toDateString, toDateTime, weekdaysFrom } from "@/lib/dates";
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
import { canUserCancel, USER_CANCEL_CUTOFF_HOURS } from "@/lib/cancellation";
import { AuthError, requireLogin, requireRole } from "@/lib/auth";

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

/**
 * 週表示のためのデータ。
 * 施術時間は画面のドラッグで決まるため、15 / 30 / 45 分すべてぶんの空き状況を
 * まとめて返す。日付 → 施術時間 → 開始時刻 → 空き枠、の順で引ける。
 * （AC-1 / AC-3 / AC-4）
 *
 * DB へは週ぶんまとめて 1 回ずつ（5 クエリ）だけアクセスし、日付・施術時間ごとの絞り込みは
 * 取得済みのデータをメモリ上でフィルタして行う（以前は日付 × 施術時間の組み合わせ、つまり
 * 平日 5 日 × 3 コース = 15 回、毎回 DB を叩いていた）。
 */
export type WeekAvailability = Record<string, Record<number, Record<string, Slot>>>;

export async function fetchWeekAvailability(
  mondayStr: string,
  genders: string[],
): Promise<WeekAvailability> {
  if (!isValidDate(mondayStr)) return {};
  const normalized = normalizeGenders(genders);
  const dates = weekdaysFrom(mondayStr);

  const weekStart = toDateTime(dates[0], "00:00");
  const weekEnd = toDateTime(dates[dates.length - 1], "00:00");
  weekEnd.setDate(weekEnd.getDate() + 1);

  const [therapists, workHours, absences, beds, reservations] = await Promise.all([
    // Therapist.active は「受付中かどうか」、User.active は「アカウントが有効かどうか」の別の話。
    // 無効化したアカウント（deleteUserAccount の「無効化」）が担当候補に残らないよう両方を見る
    prisma.therapist.findMany({
      where: { active: true, user: { active: true } },
      include: { user: true },
    }),
    prisma.therapistWorkHours.findMany(),
    prisma.therapistAbsence.findMany({
      where: { startAt: { lt: weekEnd }, endAt: { gt: weekStart } },
    }),
    prisma.bed.findMany({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.reservation.findMany({
      where: { status: "booked", startAt: { gte: weekStart, lt: weekEnd } },
    }),
  ]);

  // 性別は User が持つ（利用者・管理者も登録する）。全員必須なので未設定は無い
  const therapistSlots = therapists.map((t) => ({ id: t.id, name: t.user.name, gender: t.user.gender }));

  const result: WeekAvailability = {};

  for (const date of dates) {
    const { start, end } = dayRange(date);
    const dayAbsences = absences.filter((a) => a.startAt < end && a.endAt > start);
    const dayReservations = reservations.filter((r) => r.startAt >= start && r.startAt < end);

    const shifts = resolveShiftsForDate({ date, therapists, workHours, absences: dayAbsences });
    const reservationWindows = dayReservations.map((r) => ({
      bedId: r.bedId,
      therapistId: r.therapistId,
      startTime: hhmmOfLocal(r.startAt),
      blockEndTime: hhmmOfLocal(r.endAt),
    }));

    const byTreatment: Record<number, Record<string, Slot>> = {};
    for (const treatmentMin of TREATMENT_OPTIONS) {
      const slots = getAvailableSlots({
        shifts,
        beds,
        therapists: therapistSlots,
        reservations: reservationWindows,
        treatmentMin,
        genders: normalized,
      });
      const byTime: Record<string, Slot> = {};
      for (const slot of slots) byTime[slot.startTime] = slot;
      byTreatment[treatmentMin] = byTime;
    }
    result[date] = byTreatment;
  }

  return result;
}

export type ReserveResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * 予約を保存する（AC-2）。
 * 利用者はここでは指定しない。ログイン中のユーザー（B-1）で予約する。
 */
export async function createReservation(input: {
  date: string;
  startTime: string;
  treatmentMin: number;
  bedId: string;
  therapistId: string;
  /** 任意の備考。50 文字を超える分は切り詰める */
  note?: string;
}): Promise<ReserveResult> {
  let user;
  try {
    // マッサージ師は予約する側ではないため、画面を隠すだけでなくここでも拒否する（F-8 と同じ考え方）。
    user = await requireRole(["user", "admin"]);
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, message: e.message };
    throw e;
  }

  if (!isValidDate(input.date)) return { ok: false, message: "日付が正しくありません" };
  if (!isValidTime(input.startTime)) return { ok: false, message: "時刻が正しくありません" };
  if (!isValidTreatment(input.treatmentMin)) {
    return { ok: false, message: "施術時間が正しくありません" };
  }

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

  const note = input.note?.trim().slice(0, 50) || null;

  await prisma.reservation.create({
    data: {
      userId: user.id,
      bedId: input.bedId,
      therapistId: input.therapistId,
      startAt: toDateTime(input.date, input.startTime),
      treatmentMin: input.treatmentMin,
      endAt: toDateTime(input.date, blockEndTime),
      note,
    },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `${input.date} ${input.startTime}〜${blockEndTime} に予約しました（施術 ${input.treatmentMin} 分）`,
  };
}


export type MyReservationStatus = "予約済み" | "利用済み" | "キャンセル済み";

export type MyReservation = {
  id: string;
  date: string; // "2026-09-08"
  startTime: string; // "09:00"
  endTime: string; // "10:00"（施術 + 15 分の枠終了）
  treatmentMin: number;
  bedName: string;
  therapistName: string;
  note: string | null;
  status: MyReservationStatus;
  /** 「これから」に出すか（予約済みで、まだ始まっていない） */
  isUpcoming: boolean;
  /** 施術開始の 2 時間前を過ぎていたら false（キャンセルボタンを押せなくする） */
  canCancel: boolean;
};

/**
 * ログイン中の利用者の予約一覧（B-2）。これから・過去・キャンセル済みをすべて含めて返し、
 * 画面側（自分の予約ページ）で「これから」「過去」のタブに振り分ける。
 * 未ログインなら空配列を返す（画面側は未ログインなら /login にリダイレクト済みのはずだが念のため）。
 */
export async function listMyReservations(): Promise<MyReservation[]> {
  let user;
  try {
    user = await requireLogin();
  } catch (e) {
    if (e instanceof AuthError) return [];
    throw e;
  }

  const reservations = await prisma.reservation.findMany({
    where: { userId: user.id },
    include: { bed: true, therapist: { include: { user: true } } },
    orderBy: { startAt: "desc" },
  });

  const now = new Date();

  return reservations.map((r) => {
    const isPast = r.startAt < now;
    const status: MyReservationStatus =
      r.status === "cancelled" ? "キャンセル済み" : isPast ? "利用済み" : "予約済み";

    return {
      id: r.id,
      date: toDateString(r.startAt),
      startTime: hhmmOfLocal(r.startAt),
      endTime: hhmmOfLocal(r.endAt),
      treatmentMin: r.treatmentMin,
      bedName: r.bed.name,
      therapistName: r.therapist.user.name,
      note: r.note,
      status,
      isUpcoming: r.status === "booked" && !isPast,
      canCancel: r.status === "booked" && !isPast && canUserCancel(r.startAt),
    };
  });
}

export type CancelResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * 利用者本人が、自分の予約をキャンセルする（B-3 / B-5、AC-13）。
 * 施術開始の 2 時間前まで（design.md D-3）。管理者によるキャンセルは C 側の別アクションで扱う。
 */
export async function cancelReservation(reservationId: string): Promise<CancelResult> {
  let user;
  try {
    user = await requireLogin();
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, message: "ログインしてください" };
    throw e;
  }

  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) return { ok: false, message: "予約が見つかりません" };
  if (reservation.userId !== user.id) {
    return { ok: false, message: "この予約をキャンセルする権限がありません" };
  }
  if (reservation.status !== "booked") {
    return { ok: false, message: "この予約はすでにキャンセルされています" };
  }
  if (!canUserCancel(reservation.startAt)) {
    return {
      ok: false,
      message: `施術開始の${USER_CANCEL_CUTOFF_HOURS}時間前を過ぎているため、キャンセルできません`,
    };
  }

  await prisma.reservation.update({
    where: { id: reservationId },
    data: { status: "cancelled", cancelledById: user.id, cancelledAt: new Date() },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, message: "予約をキャンセルしました" };
}
