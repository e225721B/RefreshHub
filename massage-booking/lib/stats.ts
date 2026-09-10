// 集計（AC-6 / AC-7）の中身。画面 `/admin/stats` から使う。
//
// 権限確認とフォームの読み取りは app/actions/stats.ts が担当し、
// ここは「期間の決め方」と「数え方」だけを持つ。lib/users.ts と同じ分け方。
// aggregate() は DB に触らない純粋な関数なので、テストから直接呼んで数え方を固定できる。
//
// 数え方（design.md の Q-B の決定）:
//   ユニーク利用者数・予約数・のべ施術時間・各グラフ・一覧表 → status = "booked" だけ
//   キャンセル率 → キャンセル件数 ÷ (booked + cancelled)。利用者都合と運営都合を分ける

import { DEFAULT_WORK_WINDOWS } from "@/lib/business-hours";
import {
  formatShort,
  formatWeekLabel,
  fromDateString,
  mondayOf,
  shiftDate,
  toDateString,
  toDateTime,
  todayString,
} from "@/lib/dates";
import { prisma } from "@/lib/db";
import { toMinutes } from "@/lib/slots";

/** 期間は「YYYY-MM-DD の開始日〜終了日」。終了日その日も含む（inclusive） */
export type DateRange = { from: string; to: string };

/** 期間別グラフの横軸の刻み。期間の長さから自動で決める（学生の決定 S-1） */
export type Granularity = "day" | "week" | "month";

export const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: "日別",
  week: "週別",
  month: "月別",
};

/** 既定の期間（画面を開いた直後）。直近 30 日 */
export const DEFAULT_RANGE_DAYS = 30;

/** これより長い期間は指定できない。棒の数と DB から読む件数が際限なく増えるのを防ぐ */
export const MAX_RANGE_DAYS = 731; // 約 2 年

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-09-10" の形で、実在する日付のときだけその文字列を返す */
function parseDate(value: string | undefined): string | null {
  if (!value || !DATE_PATTERN.test(value)) return null;
  const d = fromDateString(value);
  // "2026-02-31" のような存在しない日付は Date が繰り上げるので、戻して一致を見る
  return Number.isNaN(d.getTime()) || toDateString(d) !== value ? null : value;
}

/** 開始日から終了日までの日数（両端を含む）。同じ日なら 1 */
export function daysBetween(range: DateRange): number {
  const from = fromDateString(range.from).getTime();
  const to = fromDateString(range.to).getTime();
  return Math.round((to - from) / 86_400_000) + 1;
}

/**
 * URL のクエリ（?from=...&to=...）を、集計に使える期間に正す。
 * 未指定・壊れた値 → 既定（直近 30 日）。逆順 → 入れ替え。長すぎ → 終了日から MAX_RANGE_DAYS に切る。
 */
export function normalizeRange(rawFrom?: string, rawTo?: string): DateRange {
  const today = todayString();
  const parsedFrom = parseDate(rawFrom);
  const parsedTo = parseDate(rawTo);

  let to = parsedTo ?? today;
  let from = parsedFrom ?? shiftDate(to, -(DEFAULT_RANGE_DAYS - 1));

  if (from > to) [from, to] = [to, from];
  if (daysBetween({ from, to }) > MAX_RANGE_DAYS) from = shiftDate(to, -(MAX_RANGE_DAYS - 1));

  return { from, to };
}

/**
 * 横軸の刻みを決める（学生の決定 S-1）。
 * どの期間を選んでも棒の本数が 31 本前後に収まるようにしている。
 */
export function pickGranularity(range: DateRange): Granularity {
  const days = daysBetween(range);
  if (days <= 31) return "day";
  if (days <= 182) return "week";
  return "month";
}

/** その日付が属する棒のキー。日別は日付、週別はその週の月曜、月別は "YYYY-MM" */
export function bucketKeyOf(dateStr: string, granularity: Granularity): string {
  if (granularity === "day") return dateStr;
  if (granularity === "week") return mondayOf(dateStr);
  return dateStr.slice(0, 7);
}

/** 棒の下に出す文字。"9/8(火)" / "9/7 週" / "2026/9" */
export function bucketLabel(key: string, granularity: Granularity): string {
  if (granularity === "day") return formatShort(key);
  if (granularity === "week") return formatWeekLabel(key);
  const [y, m] = key.split("-");
  return `${y}/${Number(m)}`;
}

/** 期間を刻みで区切って、棒のキーを最初から最後まで並べる（予約が 0 の区間も残す） */
export function enumerateBuckets(range: DateRange, granularity: Granularity): string[] {
  const keys: string[] = [];
  const last = bucketKeyOf(range.to, granularity);

  if (granularity === "month") {
    const cursor = fromDateString(`${range.from.slice(0, 7)}-01`);
    for (let guard = 0; guard < 1000; guard++) {
      const key = toDateString(cursor).slice(0, 7);
      keys.push(key);
      if (key >= last) break;
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
  }

  const step = granularity === "week" ? 7 : 1;
  let key = bucketKeyOf(range.from, granularity);
  for (let guard = 0; guard < 1000; guard++) {
    keys.push(key);
    if (key >= last) break;
    key = shiftDate(key, step);
  }
  return keys;
}

/** 時間帯別グラフの行。既定の勤務時間（9:00〜20:00）から作るので、休憩の時間帯も 0 件として残る */
function workingHours(): number[] {
  const first = DEFAULT_WORK_WINDOWS[0];
  const last = DEFAULT_WORK_WINDOWS[DEFAULT_WORK_WINDOWS.length - 1];
  const startHour = Math.floor(toMinutes(first.startTime) / 60);
  const endHour = Math.ceil(toMinutes(last.endTime) / 60);
  return Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
}

/** 集計に必要な予約の情報だけ。Prisma の型に依存させないので、テストから手で作れる */
export type StatsReservation = {
  userId: string;
  userName: string;
  userRole: string;
  bedId: string;
  startAt: Date;
  treatmentMin: number;
  status: string;
  /** 誰が取り消したか。利用者本人と同じなら利用者都合、違えば運営都合 */
  cancelledById: string | null;
};

export type PeriodPoint = {
  key: string;
  label: string;
  reservations: number;
  uniqueUsers: number;
};

export type UserRow = {
  userId: string;
  name: string;
  role: string;
  /** 期間中の利用回数（延べ） */
  count: number;
  /** 期間中の施術時間の合計（分。清掃の 15 分は含まない） */
  treatmentMin: number;
  /** 最後に利用した日 "2026-09-08" */
  lastUsedAt: string;
};

export type Stats = {
  range: DateRange;
  days: number;
  granularity: Granularity;
  summary: {
    /** 延べ回数ではなく人数。このプロジェクトの目的の指標（AC-6） */
    uniqueUsers: number;
    reservations: number;
    treatmentMin: number;
    /** 1 人あたりの平均利用回数。小数第 1 位まで */
    avgPerUser: number;
    cancel: {
      total: number;
      /** 利用者が自分で取り消した分 */
      byUser: number;
      /** 管理者が取り消した分（欠勤による自動キャンセルを含む） */
      byAdmin: number;
      /** キャンセル率（%）。整数に丸める */
      rate: number;
    };
  };
  period: PeriodPoint[];
  byHour: { hour: number; label: string; count: number }[];
  byBed: { bedId: string; name: string; count: number }[];
  users: UserRow[];
};

/**
 * 予約の一覧を、画面に出す数字とグラフの形に変える。DB には触らない。
 *
 * reservations には booked と cancelled の両方を渡す。
 * キャンセル率だけが cancelled を見て、他はすべて booked だけを数える。
 */
export function aggregate(params: {
  range: DateRange;
  reservations: StatsReservation[];
  beds: { id: string; name: string }[];
}): Stats {
  const { range, reservations, beds } = params;
  const granularity = pickGranularity(range);

  const booked = reservations.filter((r) => r.status === "booked");
  const cancelled = reservations.filter((r) => r.status === "cancelled");

  // --- 期間別（棒 1 本ぶんの箱をあらかじめ全部作っておく。0 件の区間も棒の位置を空けるため）
  const buckets = new Map<string, { reservations: number; users: Set<string> }>();
  for (const key of enumerateBuckets(range, granularity)) {
    buckets.set(key, { reservations: 0, users: new Set() });
  }

  // --- 時間帯別
  const hourCounts = new Map<number, number>();
  for (const hour of workingHours()) hourCounts.set(hour, 0);

  // --- ベッド別
  const bedCounts = new Map<string, number>();
  for (const bed of beds) bedCounts.set(bed.id, 0);

  // --- 利用者別
  const userRows = new Map<string, UserRow>();

  const uniqueUsers = new Set<string>();

  for (const r of booked) {
    uniqueUsers.add(r.userId);

    const dateStr = toDateString(r.startAt);
    const bucket = buckets.get(bucketKeyOf(dateStr, granularity));
    if (bucket) {
      bucket.reservations += 1;
      bucket.users.add(r.userId);
    }

    const hour = r.startAt.getHours();
    if (hourCounts.has(hour)) hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);

    // 無効化されたベッドの予約も実績なので、beds に無ければその場で足す
    bedCounts.set(r.bedId, (bedCounts.get(r.bedId) ?? 0) + 1);

    const row = userRows.get(r.userId);
    if (row) {
      row.count += 1;
      row.treatmentMin += r.treatmentMin;
      if (dateStr > row.lastUsedAt) row.lastUsedAt = dateStr;
    } else {
      userRows.set(r.userId, {
        userId: r.userId,
        name: r.userName,
        role: r.userRole,
        count: 1,
        treatmentMin: r.treatmentMin,
        lastUsedAt: dateStr,
      });
    }
  }

  const byUser = cancelled.filter((r) => r.cancelledById === r.userId).length;
  const cancelTotal = cancelled.length;
  const denominator = booked.length + cancelTotal;

  return {
    range,
    days: daysBetween(range),
    granularity,
    summary: {
      uniqueUsers: uniqueUsers.size,
      reservations: booked.length,
      treatmentMin: booked.reduce((sum, r) => sum + r.treatmentMin, 0),
      avgPerUser:
        uniqueUsers.size === 0 ? 0 : Math.round((booked.length / uniqueUsers.size) * 10) / 10,
      cancel: {
        total: cancelTotal,
        byUser,
        // 取り消した人が分からない（アカウント削除済み）分も運営側として数える
        byAdmin: cancelTotal - byUser,
        rate: denominator === 0 ? 0 : Math.round((cancelTotal / denominator) * 100),
      },
    },
    period: [...buckets].map(([key, v]) => ({
      key,
      label: bucketLabel(key, granularity),
      reservations: v.reservations,
      uniqueUsers: v.users.size,
    })),
    byHour: [...hourCounts]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => ({ hour, label: `${hour}:00`, count })),
    byBed: [...bedCounts].map(([bedId, count]) => ({
      bedId,
      name: beds.find((b) => b.id === bedId)?.name ?? "（削除されたベッド）",
      count,
    })),
    // 「よく使っている人」から並べる。回数が同じなら最近使った順、それも同じなら名前順
    users: [...userRows.values()].sort(
      (a, b) =>
        b.count - a.count ||
        b.lastUsedAt.localeCompare(a.lastUsedAt) ||
        a.name.localeCompare(b.name, "ja"),
    ),
  };
}

/** DB から期間内の予約を読んで集計する。権限確認は app/actions/stats.ts 側で行う */
export async function fetchStats(range: DateRange): Promise<Stats> {
  const start = toDateTime(range.from, "00:00");
  // 終了日その日を含めるため、翌日の 0 時「未満」で切る
  const end = toDateTime(shiftDate(range.to, 1), "00:00");

  const [beds, reservations] = await Promise.all([
    prisma.bed.findMany({ orderBy: { id: "asc" } }),
    prisma.reservation.findMany({
      // キャンセル率を出すため cancelled も読む。除外は aggregate() 側で行う
      where: { startAt: { gte: start, lt: end } },
      select: {
        userId: true,
        bedId: true,
        startAt: true,
        treatmentMin: true,
        status: true,
        cancelledById: true,
        user: { select: { name: true, role: true } },
      },
      orderBy: { startAt: "asc" },
    }),
  ]);

  return aggregate({
    range,
    beds: beds.map((b) => ({ id: b.id, name: b.name })),
    reservations: reservations.map((r) => ({
      userId: r.userId,
      userName: r.user.name,
      userRole: r.user.role,
      bedId: r.bedId,
      startAt: r.startAt,
      treatmentMin: r.treatmentMin,
      status: r.status,
      cancelledById: r.cancelledById,
    })),
  });
}

/** のべ施術時間を「3 時間 45 分」の形にする */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} 分`;
  if (m === 0) return `${h} 時間`;
  return `${h} 時間 ${m} 分`;
}
