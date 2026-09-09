// 空き枠の計算。この設計の心臓部。
// 画面から切り離してここに置くのは、自動テストで正しさを確かめるため。

import { fromDateString, hhmmOfLocal, toDateString } from "@/lib/dates";
import { DEFAULT_WORK_DAYS, DEFAULT_WORK_WINDOWS, hhmmOfTimeOfDay } from "@/lib/business-hours";

/** 押さえる枠 = 施術時間 + 清掃・準備の 15 分 */
export const CLEANUP_MIN = 15;

/** 選べる施術時間 */
export const TREATMENT_OPTIONS = [15, 30, 45] as const;
export type TreatmentMin = (typeof TREATMENT_OPTIONS)[number];

/** 空き枠を探す刻み幅（分） */
export const STEP_MIN = 15;

/** "09:00" -> 540（0 時からの分数） */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 540 -> "09:00" */
export function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type Shift = {
  therapistId: string;
  startTime: string;
  endTime: string;
};

export type Reservation = {
  bedId: string;
  therapistId: string;
  startTime: string;
  blockEndTime: string;
};

export type Gender = "female" | "male";

export type Bed = { id: string; name: string };
export type Therapist = { id: string; name: string; gender: string };

export type Slot = {
  startTime: string;
  blockEndTime: string;
  bedId: string;
  bedName: string;
  therapistId: string;
  therapistName: string;
  gender: string;
};

/** 2 つの時間帯が重なっているか */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * 空き枠を出す。
 *
 * 1. シフト（マッサージ師の勤務時間帯）を 15 分刻みに分割する
 * 2. 各時刻について「施術時間 + 15 分」ぶん勤務時間内に収まるかを見る
 * 3. その時間帯に空いているマッサージ師とベッドを 1 つずつ割り当てる
 * 4. どちらかが埋まっていればその時刻は出さない
 *
 * 利用者はマッサージ師を指名しない（AC-2）。割り当てはシステムが行う。
 */
export function getAvailableSlots(params: {
  shifts: Shift[];
  beds: Bed[];
  therapists: Therapist[];
  reservations: Reservation[];
  treatmentMin: number;
  /**
   * 希望する施術者の性別。チェックボックスで複数選べる。
   * 省略または空配列なら絞り込みなし（空いている人から自動で割り当てる）。
   */
  genders?: Gender[];
}): Slot[] {
  const { shifts, beds, therapists, reservations, treatmentMin, genders } = params;
  const genderFilter = genders && genders.length > 0 ? new Set<string>(genders) : null;
  const blockMin = treatmentMin + CLEANUP_MIN;
  const therapistById = new Map(therapists.map((t) => [t.id, t]));
  const bedById = new Map(beds.map((b) => [b.id, b]));

  // 候補となる開始時刻を集める（重複を除く）
  const startCandidates = new Set<number>();
  for (const shift of shifts) {
    const shiftStart = toMinutes(shift.startTime);
    const shiftEnd = toMinutes(shift.endTime);
    for (let t = shiftStart; t + blockMin <= shiftEnd; t += STEP_MIN) {
      startCandidates.add(t);
    }
  }

  const slots: Slot[] = [];

  for (const start of [...startCandidates].sort((a, b) => a - b)) {
    const end = start + blockMin;
    // 他の予約と重ならないかの判定には、自分の清掃時間（CLEANUP_MIN）を含めない。
    // 清掃は「施術が終わった後」に必要なだけで、直後に別の予約が入っていても構わない
    // （＝自分の清掃時間ぶん、直前の枠が塞がれる必要はない）。
    // blockMin（清掃を含む）はシフト内に収まるかどうかの判定にのみ使う。
    const treatmentEnd = start + treatmentMin;

    // この時間帯に勤務していて、かつ予約が入っていないマッサージ師。
    // 性別の希望があれば、その条件を満たす人だけから選ぶ。
    // 希望を無視して「最初に空いている人」を割り当てると、
    // 午前は常に同じ人が選ばれ、他の性別で絞り込んだとき 0 件になってしまう。
    const freeTherapist = shifts
      .filter((s) => toMinutes(s.startTime) <= start && end <= toMinutes(s.endTime))
      .map((s) => s.therapistId)
      .filter((therapistId) => {
        if (!genderFilter) return true;
        const g = therapistById.get(therapistId)?.gender;
        return g !== undefined && genderFilter.has(g);
      })
      .find(
        (therapistId) =>
          !reservations.some(
            (r) =>
              r.therapistId === therapistId &&
              overlaps(start, treatmentEnd, toMinutes(r.startTime), toMinutes(r.blockEndTime)),
          ),
      );
    if (!freeTherapist) continue;

    // この時間帯に予約が入っていないベッド
    const freeBed = beds.find(
      (bed) =>
        !reservations.some(
          (r) =>
            r.bedId === bed.id &&
            overlaps(start, treatmentEnd, toMinutes(r.startTime), toMinutes(r.blockEndTime)),
        ),
    );
    if (!freeBed) continue;

    const therapist = therapistById.get(freeTherapist);
    const bed = bedById.get(freeBed.id);
    if (!therapist || !bed) continue;

    slots.push({
      startTime: toHHMM(start),
      blockEndTime: toHHMM(end),
      bedId: bed.id,
      bedName: bed.name,
      therapistId: therapist.id,
      therapistName: therapist.name,
      gender: therapist.gender,
    });
  }

  return slots;
}

/**
 * 予約を保存する直前に、その枠がまだ空いているかを確かめる。
 * getAvailableSlots と同じ考え方で、自分の清掃時間（CLEANUP_MIN）は
 * 他の予約との重なり判定に含めない（治療時間ぶんだけで判定する）。
 */
export function isStillAvailable(params: {
  reservations: Reservation[];
  bedId: string;
  therapistId: string;
  startTime: string;
  treatmentMin: number;
}): boolean {
  const start = toMinutes(params.startTime);
  const treatmentEnd = start + params.treatmentMin;
  return !params.reservations.some(
    (r) =>
      (r.bedId === params.bedId || r.therapistId === params.therapistId) &&
      overlaps(start, treatmentEnd, toMinutes(r.startTime), toMinutes(r.blockEndTime)),
  );
}

// ---------------------------------------------------------------------------
// F-9: その日のシフト（勤務時間帯）を、Therapist の基本パターン + 例外から組み立てる。
// 「シフトを日付ごとに手入力する」のをやめ、
//   - 既定（lib/business-hours.ts。平日 9:00〜14:00・15:00〜20:00）
//   - その人だけ既定と違う場合の TherapistWorkHours（曜日ごとの例外）
//   - 急な欠勤の TherapistAbsence（重なる分だけ勤務時間から取り除く）
// から計算する（design.md の設計上の判断を参照）。
// ---------------------------------------------------------------------------

export type TherapistWorkHoursRow = {
  therapistId: string;
  dayOfWeek: number; // 0(日)〜6(土)
  startAt: Date; // 時刻だけ使う（lib/business-hours.ts の timeOfDay 形式）
  endAt: Date;
};

export type TherapistAbsenceWindow = {
  therapistId: string;
  startAt: Date; // 実際の日時
  endAt: Date;
};

export type ActiveTherapist = { id: string };

/** 開始・終了（分）の範囲から、重なる欠勤ぶんを取り除いた残りの範囲を返す */
function subtractAbsences(
  date: string,
  window: { startTime: string; endTime: string },
  absences: TherapistAbsenceWindow[],
): { startTime: string; endTime: string }[] {
  let pieces = [{ start: toMinutes(window.startTime), end: toMinutes(window.endTime) }];

  for (const absence of absences) {
    // 日をまたぐ欠勤は今回は考えない。開始日がこの日と一致するものだけを見る。
    if (toDateString(absence.startAt) !== date) continue;
    const aStart = toMinutes(hhmmOfLocal(absence.startAt));
    const aEnd = toMinutes(hhmmOfLocal(absence.endAt));

    const next: { start: number; end: number }[] = [];
    for (const p of pieces) {
      if (aEnd <= p.start || aStart >= p.end) {
        next.push(p); // 重ならない
        continue;
      }
      if (aStart > p.start) next.push({ start: p.start, end: Math.min(aStart, p.end) });
      if (aEnd < p.end) next.push({ start: Math.max(aEnd, p.start), end: p.end });
    }
    pieces = next.filter((p) => p.end > p.start);
  }

  return pieces.map((p) => ({ startTime: toHHMM(p.start), endTime: toHHMM(p.end) }));
}

/**
 * 指定した日の「候補となるシフト（勤務時間帯）」を組み立てる。
 * getAvailableSlots にそのまま渡せる Shift[] の形で返す。
 *
 * - その人の TherapistWorkHours にこの曜日の行があれば、その行だけを使う（既定は見ない）
 * - 無ければ既定（DEFAULT_WORK_DAYS / DEFAULT_WORK_WINDOWS）を使う
 * - 重なる TherapistAbsence があれば、その分だけ勤務時間から取り除く
 */
export function resolveShiftsForDate(params: {
  date: string; // "2026-09-08"
  therapists: ActiveTherapist[];
  workHours: TherapistWorkHoursRow[];
  absences: TherapistAbsenceWindow[];
}): Shift[] {
  const { date, therapists, workHours, absences } = params;
  const dayOfWeek = fromDateString(date).getDay();
  const shifts: Shift[] = [];

  for (const therapist of therapists) {
    const overrides = workHours.filter((w) => w.therapistId === therapist.id);
    const windows: { startTime: string; endTime: string }[] =
      overrides.length > 0
        ? overrides
            .filter((w) => w.dayOfWeek === dayOfWeek)
            .map((w) => ({ startTime: hhmmOfTimeOfDay(w.startAt), endTime: hhmmOfTimeOfDay(w.endAt) }))
        : DEFAULT_WORK_DAYS.includes(dayOfWeek)
          ? [...DEFAULT_WORK_WINDOWS]
          : [];

    const therapistAbsences = absences.filter((a) => a.therapistId === therapist.id);
    for (const window of windows) {
      for (const piece of subtractAbsences(date, window, therapistAbsences)) {
        shifts.push({ therapistId: therapist.id, startTime: piece.startTime, endTime: piece.endTime });
      }
    }
  }

  return shifts;
}
