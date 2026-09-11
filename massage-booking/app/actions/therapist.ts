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
import { sendPushToAdmins } from "@/lib/push";

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
  userId: string;
  userName: string;
  bedName: string;
};

export type MyAssignments = {
  isTherapist: boolean;
  therapistName: string | null;
  today: { rows: AssignmentRow[]; summary: { count: number } };
  upcoming: { rows: AssignmentRow[]; summary: { count: number } };
};

/** 自分の担当予約（AC-15）。今日ぶんと、明日以降ぶんをまとめて返す */
export async function listMyAssignments(): Promise<MyAssignments> {
  const user = await requireRole(["therapist", "admin"]);
  const therapist = await resolveMyTherapist(user.id);
  const empty: MyAssignments = {
    isTherapist: false,
    therapistName: null,
    today: { rows: [], summary: { count: 0 } },
    upcoming: { rows: [], summary: { count: 0 } },
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

  const todayRows: AssignmentRow[] = todayReservations.map((r) => ({
    id: r.id,
    date: toDateString(r.startAt),
    startTime: hhmmOfLocal(r.startAt),
    treatmentMin: r.treatmentMin,
    userId: r.userId,
    userName: r.user.name,
    bedName: r.bed.name,
  }));

  const upcomingRows: AssignmentRow[] = upcomingReservations.map((r) => ({
    id: r.id,
    date: toDateString(r.startAt),
    startTime: hhmmOfLocal(r.startAt),
    treatmentMin: r.treatmentMin,
    userId: r.userId,
    userName: r.user.name,
    bedName: r.bed.name,
  }));

  return {
    isTherapist: true,
    therapistName: therapist.user.name,
    today: { rows: todayRows, summary: { count: todayRows.length } },
    upcoming: { rows: upcomingRows, summary: { count: upcomingRows.length } },
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
  visitCount: number;
  previousDate: string | null;
  note: string | null;
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

  return {
    id: reservation.id,
    userName: reservation.user.name,
    treatmentMin: reservation.treatmentMin,
    date: toDateString(reservation.startAt),
    startTime: hhmmOfLocal(reservation.startAt),
    endTime: hhmmOfLocal(reservation.endAt),
    bedName: reservation.bed.name,
    visitCount: priorBookings.length,
    previousDate: previous ? toDateString(previous.startAt) : null,
    note: reservation.note,
  };
}

export type TreatmentHistoryRow = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  treatmentMin: number;
  bedName: string;
  note: string | null;
};

export type UserTreatmentHistory = { userName: string; rows: TreatmentHistoryRow[] };

/** ある利用者について、自分（ログイン中のマッサージ師）が過去に担当した施術の一覧 */
export async function listUserTreatmentHistory(userId: string): Promise<UserTreatmentHistory | null> {
  const user = await requireRole(["therapist", "admin"]);
  const therapist = await resolveMyTherapist(user.id);
  if (!therapist) return null;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return null;

  const now = new Date();
  const reservations = await prisma.reservation.findMany({
    where: { therapistId: therapist.id, userId, status: "booked", startAt: { lt: now } },
    include: { bed: true },
    orderBy: { startAt: "desc" },
  });

  return {
    userName: target.name,
    rows: reservations.map((r) => ({
      id: r.id,
      date: toDateString(r.startAt),
      startTime: hhmmOfLocal(r.startAt),
      endTime: hhmmOfLocal(r.endAt),
      treatmentMin: r.treatmentMin,
      bedName: r.bed.name,
      note: r.note,
    })),
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
// 休みの登録（自己申告制。予約が 1 件も無い時間帯だけ、承認なしで自分で登録できる）
// ---------------------------------------------------------------------------

export type AbsenceTarget = "day" | "am" | "pm";

const TARGET_LABEL: Record<AbsenceTarget, string> = { day: "終日", am: "午前", pm: "午後" };

/**
 * 対象日のうち、実際に働いている時間帯（既定 or 個別の TherapistWorkHours）から
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

/**
 * 休みの登録・取消を、対象ロール（今はまだ管理者だけ）へ知らせる。
 * アプリ内メールボックスへの記録に加えて、購読しているブラウザへプッシュ通知も送る。
 */
async function notifyAdmins(body: string): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: "admin", active: true } });
  if (admins.length === 0) return;
  await prisma.mailboxMessage.createMany({ data: admins.map((a) => ({ toUserId: a.id, body })) });
  await sendPushToAdmins("お知らせ", body);
}

/** 日付・対象を選んだ時点で、その範囲に何件の予約が重なるかを見せる（登録前のプレビュー） */
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

export type RegisterAbsenceResult = { ok: true; message: string } | { ok: false; message: string };

/** 休みを登録する。その時間帯に予約が 1 件でもあれば登録できない（管理者調整なしの自己申告制のため） */
export async function registerAbsence(input: {
  date: string;
  target: AbsenceTarget;
  reason?: string;
}): Promise<RegisterAbsenceResult> {
  const user = await requireRole(["therapist"]);
  const therapist = await resolveMyTherapist(user.id);
  if (!therapist) return { ok: false, message: "マッサージ師アカウントではありません" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, message: "日付が正しくありません" };
  if (!(["day", "am", "pm"] as const).includes(input.target)) {
    return { ok: false, message: "対象が正しくありません" };
  }

  const range = await resolveAbsenceRange(therapist.id, input.date, input.target);
  if (!range) return { ok: false, message: "その日は元々勤務がありません" };

  const overlappingCount = await prisma.reservation.count({
    where: {
      therapistId: therapist.id,
      status: "booked",
      startAt: { lt: range.end },
      endAt: { gt: range.start },
    },
  });
  if (overlappingCount > 0) {
    return {
      ok: false,
      message: `この時間帯には予約が ${overlappingCount} 件入っているため、休みを登録できません。`,
    };
  }

  const reason = input.reason?.trim() || null;

  await prisma.therapistAbsence.create({
    data: {
      therapistId: therapist.id,
      startAt: range.start,
      endAt: range.end,
      reason,
      createdById: user.id,
    },
  });

  await notifyAdmins(
    `${therapist.user.name}さんが ${input.date}（${TARGET_LABEL[input.target]}）の休みを登録しました` +
      (reason ? `（理由：${reason}）` : ""),
  );

  revalidatePath("/therapist/absence");

  return { ok: true, message: "休みを登録しました" };
}

export type AbsenceRow = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string | null;
  createdAt: string;
};

/** 自分が登録した休みの一覧（新しい日付が先） */
export async function listMyAbsences(): Promise<AbsenceRow[]> {
  const user = await requireRole(["therapist"]);
  const therapist = await resolveMyTherapist(user.id);
  if (!therapist) return [];

  const rows = await prisma.therapistAbsence.findMany({
    where: { therapistId: therapist.id, createdById: user.id },
    orderBy: { startAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    date: toDateString(r.startAt),
    startTime: hhmmOfLocal(r.startAt),
    endTime: hhmmOfLocal(r.endAt),
    reason: r.reason,
    createdAt: toDateString(r.createdAt),
  }));
}

export type CancelAbsenceResult = { ok: true; message: string } | { ok: false; message: string };

/** 登録した休みを取り消す。自分が登録したものだけ取り消せる */
export async function cancelAbsence(id: string): Promise<CancelAbsenceResult> {
  const user = await requireRole(["therapist"]);
  const therapist = await resolveMyTherapist(user.id);
  if (!therapist) return { ok: false, message: "マッサージ師アカウントではありません" };

  const absence = await prisma.therapistAbsence.findUnique({ where: { id } });
  if (!absence || absence.therapistId !== therapist.id || absence.createdById !== user.id) {
    throw new AuthError("この休みを取り消す権限がありません");
  }

  await prisma.therapistAbsence.delete({ where: { id } });

  await notifyAdmins(`${therapist.user.name}さんが ${toDateString(absence.startAt)} の休みを取り消しました`);

  revalidatePath("/therapist/absence");

  return { ok: true, message: "休みの登録を取り消しました" };
}
