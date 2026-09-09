// 空き枠の計算。この設計の心臓部。
// 画面から切り離してここに置くのは、自動テストで正しさを確かめるため。

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
              overlaps(start, end, toMinutes(r.startTime), toMinutes(r.blockEndTime)),
          ),
      );
    if (!freeTherapist) continue;

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
