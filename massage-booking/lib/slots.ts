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
 * その日すでに割り当たっている拘束時間（施術 + 清掃の 15 分）を、マッサージ師ごとに合計する。
 * 「まだ担当が無い人」は 0 分になり、次の割り当てで最優先になる。
 */
function assignedMinutes(reservations: Reservation[]): Map<string, number> {
  const minutes = new Map<string, number>();
  for (const r of reservations) {
    const length = toMinutes(r.blockEndTime) - toMinutes(r.startTime);
    minutes.set(r.therapistId, (minutes.get(r.therapistId) ?? 0) + length);
  }
  return minutes;
}

/**
 * 空いている人の中から 1 人を選ぶ。**同じ人に偏らせないことがこの関数の仕事。**
 *
 * 以前は「勤務リストの先頭から最初に空いている人」を選んでいたため、
 * 予約が少ないうちは**毎回同じ人に割り当たっていた**（午前は常に同じ人になる）。
 *
 * 1. **その日の担当時間が少ない人**を優先する。まだ担当が無い人は 0 分なので必ず先に選ばれる。
 * 2. 担当時間が同じなら、**時間帯ごとに順番をずらす**（9:00 は 1 番目、9:15 は 2 番目…）。
 *    これをしないと、全員 0 分の朝いちばんの状態で先頭の人にすべての枠が表示される。
 *
 * @param rotation 何番目の開始時刻か。順番をずらすために使う
 */
function pickTherapist(
  candidates: Therapist[],
  minutes: Map<string, number>,
  rotation: number,
): Therapist {
  const offset = rotation % candidates.length;
  const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];
  const load = (t: Therapist) => minutes.get(t.id) ?? 0;
  // 同点のときは rotated の先頭（= ずらした後の 1 番目）が残るよう、< で比べる
  return rotated.reduce((best, t) => (load(t) < load(best) ? t : best), rotated[0]);
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
 * **誰を割り当てるかは pickTherapist で決める。先頭の人に寄せない**（下のコメントを参照）。
 */
export function getAvailableSlots(params: {
  shifts: Shift[];
  beds: Bed[];
  therapists: Therapist[];
  reservations: Reservation[];
  treatmentMin: number;
  /**
   * 希望する施術者の id（Issue #9）。画面のチェックボックスで選ばれた人。
   *
   * - 省略（undefined）: 絞り込みなし。勤務中で空いている人から自動で割り当てる
   * - 空配列: 誰も選ばれていない ＝ 該当なし（0 件）
   *
   * 性別での絞り込みは「その性別の施術者をまとめてチェックする」操作に置き換えた。
   * ここで受け取る条件を施術者 id の 1 種類だけにして、性別と施術者の二重管理を避けている。
   */
  therapistIds?: string[];
  /**
   * この時刻より後に始まる枠だけを返す（"HH:MM"）。省略すれば時刻で絞らない。
   * **今日の分を計算するときに「今」を渡す**ことで、過ぎた時間の枠を出さないために使う。
   * 日付を持たないこの関数に「今日かどうか」の判断はさせず、呼び出し側（fetchWeekAvailability）が決める。
   */
  notBefore?: string;
}): Slot[] {
  const { shifts, beds, therapists, reservations, treatmentMin, therapistIds, notBefore } = params;
  const earliestStart = notBefore === undefined ? null : toMinutes(notBefore);
  const therapistFilter = therapistIds ? new Set(therapistIds) : null;
  // 1 人も選ばれていなければ、割り当てられる人がいないので枠は出ない
  if (therapistFilter && therapistFilter.size === 0) return [];
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
  // その日の担当ぶん。少ない人から割り当てるために使う
  const minutesByTherapist = assignedMinutes(reservations);
  const startTimes = [...startCandidates].sort((a, b) => a - b);

  for (const [index, start] of startTimes.entries()) {
    // もう過ぎている開始時刻は候補にしない（今日の午前など）
    if (earliestStart !== null && start <= earliestStart) continue;
    const end = start + blockMin;

    // この時間帯に勤務していて、かつ予約が入っていないマッサージ師。
    // 希望する施術者が指定されていれば、その人たちの中だけから選ぶ。
    // 先に割り当ててから絞り込むと、別の人が選ばれた時刻が候補ごと消えてしまう。
    //
    // 候補の並び順は shifts ではなく therapists に合わせる。
    // shifts は「勤務時間帯」の一覧で、1 人が午前・午後と 2 行に分かれることがあり、
    // 並び順が人の順番を表さないため（順番をずらす pickTherapist が正しく回らなくなる）。
    const candidates = therapists.filter((t) => {
      if (therapistFilter && !therapistFilter.has(t.id)) return false;
      const onShift = shifts.some(
        (s) =>
          s.therapistId === t.id &&
          toMinutes(s.startTime) <= start &&
          end <= toMinutes(s.endTime),
      );
      if (!onShift) return false;
      return !reservations.some(
        (r) =>
          r.therapistId === t.id &&
          overlaps(start, end, toMinutes(r.startTime), toMinutes(r.blockEndTime)),
      );
    });
    if (candidates.length === 0) continue;

    // 誰にするかは「その日の担当時間が少ない人」→「時間帯ごとにずらした順番」で決める
    const freeTherapist = pickTherapist(candidates, minutesByTherapist, index).id;

    // この時間帯に予約が入っていないベッド
    const freeBed = beds.find(
      (bed) =>
        !reservations.some(
          (r) =>
            r.bedId === bed.id &&
            overlaps(start, end, toMinutes(r.startTime), toMinutes(r.blockEndTime)),
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
 * 指名（または自動割り当て）されたマッサージ師が、**本当にその時間に対応できるか**を確かめる。
 *
 * - その時間帯に勤務しているか（欠勤・午前のみなどを反映した shifts で見る）
 * - その時間帯に別の予約が入っていないか
 *
 * 画面が出した候補をそのまま信じない。予約の保存要求は画面を通さずに直接呼べるため、
 * 「勤務していない人」「すでに埋まっている人」を指定されても保存しないようにする。
 */
export function canAssignTherapist(params: {
  shifts: Shift[];
  reservations: Reservation[];
  therapistId: string;
  startTime: string;
  blockEndTime: string;
}): boolean {
  const start = toMinutes(params.startTime);
  const end = toMinutes(params.blockEndTime);

  const onShift = params.shifts.some(
    (s) =>
      s.therapistId === params.therapistId &&
      toMinutes(s.startTime) <= start &&
      end <= toMinutes(s.endTime),
  );
  if (!onShift) return false;

  return !params.reservations.some(
    (r) =>
      r.therapistId === params.therapistId &&
      overlaps(start, end, toMinutes(r.startTime), toMinutes(r.blockEndTime)),
  );
}

/** 予約を保存する直前に、その枠がまだ空いているかを確かめる */
export function isStillAvailable(params: {
  reservations: Reservation[];
  bedId: string;
  therapistId: string;
  startTime: string;
  blockEndTime: string;
}): boolean {
  const start = toMinutes(params.startTime);
  const end = toMinutes(params.blockEndTime);
  return !params.reservations.some(
    (r) =>
      (r.bedId === params.bedId || r.therapistId === params.therapistId) &&
      overlaps(start, end, toMinutes(r.startTime), toMinutes(r.blockEndTime)),
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
