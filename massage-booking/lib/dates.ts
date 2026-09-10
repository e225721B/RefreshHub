// 週表示のための日付ユーティリティ。
// 日付は "2026-09-08" の文字列で扱う（DB の持ち方に合わせる）。

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** Date -> "2026-09-08" */
export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** "2026-09-08" -> Date（ローカル時刻の 0 時） */
export function fromDateString(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayString(): string {
  return toDateString(new Date());
}

/** その日付が含まれる週の月曜日を返す */
export function mondayOf(dateStr: string): string {
  const d = fromDateString(dateStr);
  const day = d.getDay(); // 0=日, 1=月, ... 6=土
  const diff = day === 0 ? -6 : 1 - day; // 日曜は前の週の月曜に寄せる
  d.setDate(d.getDate() + diff);
  return toDateString(d);
}

/** 月曜から金曜までの 5 日ぶんの日付を返す（マッサージ室は平日稼働の想定） */
export function weekdaysFrom(mondayStr: string): string[] {
  const monday = fromDateString(mondayStr);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toDateString(d);
  });
}

/** 週をずらす（offset は週単位。-1 で前週、+1 で翌週） */
export function shiftWeek(mondayStr: string, offset: number): string {
  const d = fromDateString(mondayStr);
  d.setDate(d.getDate() + offset * 7);
  return toDateString(d);
}

/** 日付を n 日ずらす（n はマイナス可） */
export function addDays(dateStr: string, n: number): string {
  const d = fromDateString(dateStr);
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

/** "2026-09-08" -> "9/8(火)" */
export function formatShort(dateStr: string): string {
  const d = fromDateString(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_LABELS[d.getDay()]})`;
}

/** "2026-09-07" -> "9/7 週" */
export function formatWeekLabel(mondayStr: string): string {
  const d = fromDateString(mondayStr);
  return `${d.getMonth() + 1}/${d.getDate()} 週`;
}

/** その日付が過去かどうか（今日は過去としない） */
export function isPast(dateStr: string): boolean {
  return dateStr < todayString();
}

/**
 * "2026-09-08" + "09:00" -> Date（ローカル時刻。全時刻を JST 固定で扱う想定。design.md 参照）
 * Reservation / TherapistAbsence の startAt / endAt を組み立てるときに使う。
 */
export function toDateTime(dateStr: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = fromDateString(dateStr);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Date -> "09:00"（ローカル時刻の時分。toDateTime の逆変換） */
export function hhmmOfLocal(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
