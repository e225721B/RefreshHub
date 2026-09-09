// 既定の勤務パターン（平日 9:00〜14:00・15:00〜20:00）。
// ほとんどのマッサージ師はこれをそのまま使う。
// 「午前中しか働けない」など既定と違う人だけ、個別に TherapistWorkHours を持つ（design.md 参照）。

/** 既定の出勤曜日。0(日)〜6(土)。Date.getDay() と揃える */
export const DEFAULT_WORK_DAYS: readonly number[] = [1, 2, 3, 4, 5]; // 月〜金

/** 既定の勤務時間帯（午前・午後） */
export const DEFAULT_WORK_WINDOWS: readonly { startTime: string; endTime: string }[] = [
  { startTime: "09:00", endTime: "14:00" },
  { startTime: "15:00", endTime: "20:00" },
];

/**
 * TherapistWorkHours.startAt / endAt は「毎週この曜日はこの時刻」という繰り返しルールで、
 * 特定の日付を持たない。日付部分はダミー値（1970-01-01, UTC）とし、時刻部分だけを使う。
 */
const TIME_ONLY_EPOCH = "1970-01-01";

/** "09:00" -> ダミー日付を使った Date（時刻部分だけが意味を持つ） */
export function timeOfDay(hhmm: string): Date {
  return new Date(`${TIME_ONLY_EPOCH}T${hhmm}:00.000Z`);
}

/** timeOfDay() で作った Date -> "09:00" */
export function hhmmOfTimeOfDay(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
