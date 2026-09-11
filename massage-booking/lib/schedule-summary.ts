// マッサージ師紹介画面（画面 3）用。その人の勤務パターンを「月〜金 終日」のような
// 短い日本語の 1 行に要約する。表示用の別データは持たず、予約に実際に使っている
// TherapistWorkHours / lib/business-hours.ts から毎回計算する（二重管理を避けるため）。

import { hhmmOfTimeOfDay, DEFAULT_WORK_DAYS, DEFAULT_WORK_WINDOWS } from "@/lib/business-hours";

const WEEKDAY_KANJI = ["日", "月", "火", "水", "木", "金", "土"];

export type WorkHoursRow = { dayOfWeek: number; startAt: Date; endAt: Date };

/** その曜日の勤務時間帯を 1 語に分類する */
function labelForWindow(startTime: string, endTime: string): string {
  const [amStart, amEnd] = [DEFAULT_WORK_WINDOWS[0].startTime, DEFAULT_WORK_WINDOWS[0].endTime];
  const [pmStart, pmEnd] = [DEFAULT_WORK_WINDOWS[1].startTime, DEFAULT_WORK_WINDOWS[1].endTime];
  if (startTime === amStart && endTime === pmEnd) return "終日";
  if (startTime === amStart && endTime === amEnd) return "午前";
  if (startTime === pmStart && endTime === pmEnd) return "午後";
  return `${startTime}〜${endTime}`;
}

/** 連続する曜日をまとめる。例: [1,2,3,4,5] -> "月〜金"、[1,3,4,5] -> "月・水〜金" */
function formatDayRanges(days: number[]): string {
  if (days.length === 0) return "";
  const ranges: string[] = [];
  let start = days[0];
  let prev = days[0];
  for (let i = 1; i <= days.length; i++) {
    const cur = days[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    ranges.push(start === prev ? WEEKDAY_KANJI[start] : `${WEEKDAY_KANJI[start]}〜${WEEKDAY_KANJI[prev]}`);
    if (cur !== undefined) {
      start = cur;
      prev = cur;
    }
  }
  return ranges.join("・");
}

/** 曜日 -> その日の勤務ラベル（無ければ undefined） */
function dayLabels(workHours: WorkHoursRow[]): Map<number, string> {
  const labels = new Map<number, string>();
  if (workHours.length > 0) {
    for (const w of workHours) {
      labels.set(w.dayOfWeek, labelForWindow(hhmmOfTimeOfDay(w.startAt), hhmmOfTimeOfDay(w.endAt)));
    }
  } else {
    for (const day of DEFAULT_WORK_DAYS) labels.set(day, "終日");
  }
  return labels;
}

/**
 * 週の勤務パターンを 1 行に要約する。
 * 例: "月〜金 終日"、"月〜金 午前"、"月〜水 終日・木〜金 午前"
 */
export function summarizeWeeklySchedule(workHours: WorkHoursRow[]): string {
  const labels = dayLabels(workHours);
  if (labels.size === 0) return "現在稼働なし";

  // 同じラベルが続く曜日をまとめるため、ラベルごとに曜日を集める（曜日の登場順は維持）
  const daysByLabel = new Map<string, number[]>();
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    const label = labels.get(day);
    if (!label) continue;
    if (!daysByLabel.has(label)) daysByLabel.set(label, []);
    daysByLabel.get(label)!.push(day);
  }

  const segments = [...daysByLabel.entries()].map(
    ([label, days]) => `${formatDayRanges([...days].sort((a, b) => a - b))} ${label}`,
  );
  return segments.join("・");
}
