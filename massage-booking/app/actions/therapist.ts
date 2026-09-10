"use server";

// マッサージ師向けの画面（/therapist）の Server Actions。
// スコープ: 自分の担当予約一覧（AC-15）、施術者全員のシフト閲覧（読み取り専用）、休み申請の送信・履歴。
// 休み申請は「送る」までがスコープ。管理者の承認画面・承認時の自動キャンセルは未実装（design.md 参照）。

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { AuthError, requireRole } from "@/lib/auth";
import {
  addDays,
  mondayOf,
  toDateString,
  toDateTime,
  todayString,
  weekdaysFrom,
  hhmmOfLocal,
} from "@/lib/dates";
import { resolveShiftsForDate, toMinutes } from "@/lib/slots";

/** ログイン中のユーザーに紐づく Therapist を探す。管理者などマッサージ師でない人は null */
async function resolveMyTherapist(userId: string) {
  return prisma.therapist.findUnique({ where: { userId }, include: { user: true } });
}

// ---------------------------------------------------------------------------
// 本日の予約（AC-15）
// ---------------------------------------------------------------------------

export type AssignmentRow = {
  id: string;
  date: string;
  startTime: string;
  treatmentMin: number;
  userName: string;
  bedName: string;
};

export type MyAssignments = {
  isTherapist: boolean;
  therapistName: string | null;
  today: { rows: AssignmentRow[]; summary: { count: number; totalTreatmentMin: number; nextIn: number | null } };
  upcoming: { rows: AssignmentRow[]; summary: { count: number; totalTreatmentMin: number } };
};

/** 自分の担当予約（AC-15）。今日ぶんと、明日以降ぶんをまとめて返す */
export async function listMyAssignments(): Promise<MyAssignments> {
  const user = await requireRole(["therapist", "admin"]);
  const therapist = await resolveMyTherapist(user.id);
  const empty: MyAssignments = {
    isTherapist: false,
    therapistName: null,
    today: { rows: [], summary: { count: 0, totalTreatmentMin: 0, nextIn: null } },
    upcoming: { rows: [], summary: { count: 0, totalTreatmentMin: 0 } },
  };
  if (!therapist) return empty;

  const today = todayString();
  const todayStart = toDateTime(today, "00:00");
  const tomorrowStart = toDateTime(addDays(today, 1), "00:00");

  const [todayReservations, upcomingReservations] = await Promise.all([
    prisma.reservation.findMany({
      where: { therapistId: therapist.id, status: "booked", startAt: { gte: todayStart, lt: tomorrowStart } },
      include: { user: true, bed: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.reservation.findMany({
      where: { therapistId: therapist.id, status: "booked", startAt: { gte: tomorrowStart } },
      include: { user: true, bed: true },
      orderBy: { startAt: "asc" },
    }),
  ]);

  const now = new Date();
  const todayRows: AssignmentRow[] = todayReservations.map((r) => ({
    id: r.id,
    date: toDateString(r.startAt),
    startTime: hhmmOfLocal(r.startAt),
    treatmentMin: r.treatmentMin,
    userName: r.user.name,
    bedName: r.bed.name,
  }));
  const todayTotalTreatmentMin = todayRows.reduce((sum, r) => sum + r.treatmentMin, 0);
  const nextRow = todayReservations.find((r) => r.endAt > now);
  const nextIn = nextRow ? Math.max(0, Math.round((nextRow.startAt.getTime() - now.getTime()) / 60000)) : null;

  const upcomingRows: AssignmentRow[] = upcomingReservations.map((r) => ({
    id: r.id,
    date: toDateString(r.startAt),
    startTime: hhmmOfLocal(r.startAt),
    treatmentMin: r.treatmentMin,
    userName: r.user.name,
    bedName: r.bed.name,
  }));
  const upcomingTotalTreatmentMin = upcomingRows.reduce((sum, r) => sum + r.treatmentMin, 0);

  return {
    isTherapist: true,
    therapistName: therapist.user.name,
    today: { rows: todayRows, summary: { count: todayRows.length, totalTreatmentMin: todayTotalTreatmentMin, nextIn } },
    upcoming: { rows: upcomingRows, summary: { count: upcomingRows.length, totalTreatmentMin: upcomingTotalTreatmentMin } },
  };
}

export type AssignmentDetail = {
  id: string;
  userName: string;
  treatmentMin: number;
  date: string;
  startTime: string;
  endTime: string;
  bedName: string;
  createdAtDate: string;
  createdAtTime: string;
  visitCount: number;
  previousDate: string | null;
  note: string | null;
  adminEmail: string | null;
};

/** 予約詳細（T-4）。自分の担当ぶんだけ見られる（管理者は例外） */
export async function getReservationDetail(id: string): Promise<AssignmentDetail | null> {
  const user = await requireRole(["therapist", "admin"]);
  const therapist = await resolveMyTherapist(user.id);

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { user: true, bed: true },
  });
  if (!reservation) return null;
  if (user.role !== "admin" && (!therapist || reservation.therapistId !== therapist.id)) {
    throw new AuthError("この予約を見る権限がありません");
  }

  // 同じ利用者・同じ施術者の組み合わせで、これまで何回目の利用か（今回を含む）
  const priorBookings = await prisma.reservation.findMany({
    where: {
      userId: reservation.userId,
      therapistId: reservation.therapistId,
      status: "booked",
      startAt: { lte: reservation.startAt },
    },
    orderBy: { startAt: "desc" },
  });
  const previous = priorBookings[1];
  const admin = await prisma.user.findFirst({ where: { role: "admin", active: true }, orderBy: { name: "asc" } });

  return {
    id: reservation.id,
    userName: reservation.user.name,
    treatmentMin: reservation.treatmentMin,
    date: toDateString(reservation.startAt),
    startTime: hhmmOfLocal(reservation.startAt),
    endTime: hhmmOfLocal(reservation.endAt),
    bedName: reservation.bed.name,
    createdAtDate: toDateString(reservation.createdAt),
    createdAtTime: hhmmOfLocal(reservation.createdAt),
    visitCount: priorBookings.length,
    previousDate: previous ? toDateString(previous.startAt) : null,
    note: reservation.note,
    adminEmail: admin?.email ?? null,
  };
}

// ---------------------------------------------------------------------------
// シフト一覧（読み取り専用。自分 + 他のマッサージ師のシフトと予約をまとめて見る）
// ---------------------------------------------------------------------------

export type TherapistOption = { id: string; name: string; gender: string; isSelf: boolean };

export async function listActiveTherapists(): Promise<TherapistOption[]> {
  const user = await requireRole(["therapist", "admin"]);
  const therapists = await prisma.therapist.findMany({
    where: { active: true },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });
  return therapists.map((t) => ({
    id: t.id,
    name: t.user.name,
    gender: t.user.gender,
    isSelf: t.userId === user.id,
  }));
}

export type ShiftOverviewWindow = { startTime: string; endTime: string };
export type ShiftOverviewReservation = {
  id: string;
  startTime: string;
  endTime: string;
  userName: string;
  bedName: string;
};
export type ShiftOverview = Record<
  string,
  Record<string, { windows: ShiftOverviewWindow[]; reservations: ShiftOverviewReservation[] }>
>;

export async function listShiftOverview(mondayStr: string, therapistIds: string[]): Promise<ShiftOverview> {
  await requireRole(["therapist", "admin"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mondayStr) || therapistIds.length === 0) return {};

  const dates = weekdaysFrom(mondayOf(mondayStr));
  const [therapists, workHours, absences] = await Promise.all([
    prisma.therapist.findMany({ where: { id: { in: therapistIds } } }),
    prisma.therapistWorkHours.findMany({ where: { therapistId: { in: therapistIds } } }),
    prisma.therapistAbsence.findMany({ where: { therapistId: { in: therapistIds } } }),
  ]);

  const start = toDateTime(dates[0], "00:00");
  const end = toDateTime(dates[dates.length - 1], "00:00");
  end.setDate(end.getDate() + 1);
  const reservations = await prisma.reservation.findMany({
    where: { therapistId: { in: therapistIds }, status: "booked", startAt: { gte: start, lt: end } },
    include: { user: true, bed: true },
  });

  const result: ShiftOverview = {};
  for (const date of dates) {
    result[date] = {};
    const dayShifts = resolveShiftsForDate({ date, therapists, workHours, absences });
    for (const therapistId of therapistIds) {
      const windows = dayShifts
        .filter((s) => s.therapistId === therapistId)
        .map((s) => ({ startTime: s.startTime, endTime: s.endTime }));
      const dayReservations = reservations
        .filter((r) => r.therapistId === therapistId && toDateString(r.startAt) === date)
        .map((r) => ({
          id: r.id,
          startTime: hhmmOfLocal(r.startAt),
          endTime: hhmmOfLocal(r.endAt),
          userName: r.user.name,
          bedName: r.bed.name,
        }));
      result[date][therapistId] = { windows, reservations: dayReservations };
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 休み申請（送信・履歴のみ。承認は今回のスコープ外）
// ---------------------------------------------------------------------------

export type AbsenceTarget = "day" | "am" | "pm";

/**
 * 申請対象日のうち、実際に働いている時間帯（既定 or 個別の TherapistWorkHours）から
 * target に応じた範囲を切り出す。その日そもそも勤務が無ければ null。
 *
 * 制約: 勤務帯が 1 つしか無い人（午前のみ等）が pm を選んでも、
 * 唯一の勤務帯がそのまま返る（大きな実害は無いため、今回は許容する）。
 */
async function resolveAbsenceRange(
  therapistId: string,
  date: string,
  target: AbsenceTarget,
): Promise<{ start: Date; end: Date } | null> {
  const [workHours, absences] = await Promise.all([
    prisma.therapistWorkHours.findMany({ where: { therapistId } }),
    prisma.therapistAbsence.findMany({ where: { therapistId } }),
  ]);
  const shifts = resolveShiftsForDate({
    date,
    therapists: [{ id: therapistId }],
    workHours,
    absences,
  }).sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  if (shifts.length === 0) return null;

  const first = shifts[0];
  const last = shifts[shifts.length - 1];
  const window =
    target === "day" ? { startTime: first.startTime, endTime: last.endTime } : target === "am" ? first : last;

  return { start: toDateTime(date, window.startTime), end: toDateTime(date, window.endTime) };
}

export type AbsenceRequestResult =
  | { ok: true; message: string; overlappingCount: number }
  | { ok: false; message: string };

/** 日付・対象を選んだ時点で、その範囲に何件の予約が重なるかを見せる（送信前のプレビュー） */
export async function previewAbsenceOverlap(date: string, target: AbsenceTarget): Promise<number | null> {
  const user = await requireRole(["therapist"]);
  const therapist = await resolveMyTherapist(user.id);
  if (!therapist || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const range = await resolveAbsenceRange(therapist.id, date, target);
  if (!range) return 0;
  return prisma.reservation.count({
    where: {
      therapistId: therapist.id,
      status: "booked",
      startAt: { lt: range.end },
      endAt: { gt: range.start },
    },
  });
}

export async function createAbsenceRequest(input: {
  date: string;
  target: AbsenceTarget;
  reason?: string;
}): Promise<AbsenceRequestResult> {
  const user = await requireRole(["therapist"]);
  const therapist = await resolveMyTherapist(user.id);
  if (!therapist) return { ok: false, message: "マッサージ師アカウントではありません" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, message: "日付が正しくありません" };
  if (!(["day", "am", "pm"] as const).includes(input.target)) {
    return { ok: false, message: "対象が正しくありません" };
  }

  const range = await resolveAbsenceRange(therapist.id, input.date, input.target);
  const overlappingCount = range
    ? await prisma.reservation.count({
        where: {
          therapistId: therapist.id,
          status: "booked",
          startAt: { lt: range.end },
          endAt: { gt: range.start },
        },
      })
    : 0;

  await prisma.absenceRequest.create({
    data: {
      therapistId: therapist.id,
      date: toDateTime(input.date, "00:00"),
      target: input.target,
      reason: input.reason?.trim() || null,
      status: "pending",
    },
  });

  revalidatePath("/therapist/absence");

  return {
    ok: true,
    overlappingCount,
    message:
      overlappingCount > 0
        ? `休みを申請しました。この日には予約が ${overlappingCount} 件入っています。承認され次第、管理者が調整します。`
        : "休みを申請しました。管理者の承認をお待ちください。",
  };
}

export type AbsenceRequestRow = {
  id: string;
  date: string;
  target: AbsenceTarget;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export async function listMyAbsenceRequests(): Promise<AbsenceRequestRow[]> {
  const user = await requireRole(["therapist"]);
  const therapist = await resolveMyTherapist(user.id);
  if (!therapist) return [];

  const rows = await prisma.absenceRequest.findMany({
    where: { therapistId: therapist.id },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    date: toDateString(r.date),
    target: r.target as AbsenceTarget,
    reason: r.reason,
    status: r.status as AbsenceRequestRow["status"],
    createdAt: toDateString(r.createdAt),
  }));
}
