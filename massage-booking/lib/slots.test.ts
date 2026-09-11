import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAssignTherapist,
  getAvailableSlots,
  isStillAvailable,
  resolveShiftsForDate,
  toHHMM,
  toMinutes,
} from "./slots";
import { timeOfDay } from "./business-hours";
import { toDateTime } from "./dates";

const beds = [
  { id: "b1", name: "ベッド A" },
  { id: "b2", name: "ベッド B" },
  { id: "b3", name: "ベッド C" },
];
const therapists = [
  { id: "t1", name: "佐藤", gender: "female" },
  { id: "t2", name: "鈴木", gender: "male" },
];
// 午前 9:00-10:00 だけ勤務するマッサージ師 1 名（計算を追いやすくするため短くする）
const oneHourShift = [{ therapistId: "t1", startTime: "09:00", endTime: "10:00" }];

test("時刻の相互変換", () => {
  assert.equal(toMinutes("09:00"), 540);
  assert.equal(toHHMM(540), "09:00");
  assert.equal(toHHMM(555), "09:15");
});

test("施術 45 分は枠 60 分。1 時間の勤務なら開始できるのは 9:00 の 1 つだけ", () => {
  const slots = getAvailableSlots({
    shifts: oneHourShift,
    beds,
    therapists,
    reservations: [],
    treatmentMin: 45,
  });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].startTime, "09:00");
  assert.equal(slots[0].blockEndTime, "10:00");
});

test("施術 15 分は枠 30 分。1 時間の勤務なら 9:00 / 9:15 / 9:30 の 3 つ", () => {
  const slots = getAvailableSlots({
    shifts: oneHourShift,
    beds,
    therapists,
    reservations: [],
    treatmentMin: 15,
  });
  assert.deepEqual(
    slots.map((s) => s.startTime),
    ["09:00", "09:15", "09:30"],
  );
  assert.equal(slots[0].blockEndTime, "09:30");
});

test("施術 30 分は枠 45 分。1 時間の勤務なら 9:00 / 9:15 の 2 つ", () => {
  const slots = getAvailableSlots({
    shifts: oneHourShift,
    beds,
    therapists,
    reservations: [],
    treatmentMin: 30,
  });
  assert.deepEqual(
    slots.map((s) => s.startTime),
    ["09:00", "09:15"],
  );
});

test("予約済みの時間帯は候補から消える（マッサージ師が 1 人しかいない場合）", () => {
  const slots = getAvailableSlots({
    shifts: oneHourShift,
    beds,
    therapists,
    reservations: [
      { bedId: "b1", therapistId: "t1", startTime: "09:00", blockEndTime: "09:30" },
    ],
    treatmentMin: 15,
  });
  // 9:00 と 9:15 は t1 が埋まっているため消え、9:30 だけ残る
  assert.deepEqual(
    slots.map((s) => s.startTime),
    ["09:30"],
  );
});

test("マッサージ師が 2 人いれば、1 人が埋まっていても枠は残る", () => {
  const slots = getAvailableSlots({
    shifts: [
      { therapistId: "t1", startTime: "09:00", endTime: "10:00" },
      { therapistId: "t2", startTime: "09:00", endTime: "10:00" },
    ],
    beds,
    therapists,
    reservations: [
      { bedId: "b1", therapistId: "t1", startTime: "09:00", blockEndTime: "09:30" },
    ],
    treatmentMin: 15,
  });
  const nine = slots.find((s) => s.startTime === "09:00");
  assert.ok(nine, "9:00 の枠が残ること");
  assert.equal(nine.therapistId, "t2", "空いている方のマッサージ師が割り当てられること");
});

test("ベッドが全部埋まっていれば、マッサージ師が空いていても枠は出ない", () => {
  const slots = getAvailableSlots({
    shifts: [
      { therapistId: "t1", startTime: "09:00", endTime: "10:00" },
      { therapistId: "t2", startTime: "09:00", endTime: "10:00" },
    ],
    beds: [{ id: "b1", name: "ベッド A" }],
    therapists,
    reservations: [
      { bedId: "b1", therapistId: "t2", startTime: "09:00", blockEndTime: "09:30" },
    ],
    treatmentMin: 15,
  });
  assert.equal(slots.find((s) => s.startTime === "09:00"), undefined);
});

test("勤務時間をはみ出す枠は出さない（9:45 開始の 30 分枠は 10:15 になるため不可）", () => {
  const slots = getAvailableSlots({
    shifts: oneHourShift,
    beds,
    therapists,
    reservations: [],
    treatmentMin: 15,
  });
  assert.equal(slots.some((s) => s.startTime === "09:45"), false);
});

test("保存直前の確認: 同じベッドが埋まっていれば false", () => {
  const ok = isStillAvailable({
    reservations: [
      { bedId: "b1", therapistId: "t2", startTime: "09:00", blockEndTime: "09:30" },
    ],
    bedId: "b1",
    therapistId: "t1",
    startTime: "09:15",
    blockEndTime: "09:45",
  });
  assert.equal(ok, false);
});

test("保存直前の確認: ベッドもマッサージ師も空いていれば true", () => {
  const ok = isStillAvailable({
    reservations: [
      { bedId: "b1", therapistId: "t2", startTime: "09:00", blockEndTime: "09:30" },
    ],
    bedId: "b2",
    therapistId: "t1",
    startTime: "09:00",
    blockEndTime: "09:30",
  });
  assert.equal(ok, true);
});

// --- Issue #9: 施術者ごとの絞り込み ---
// 画面の「女性」「男性」のチェックは、そのグループの施術者をまとめて選ぶ操作なので、
// ここに渡ってくる条件は施術者 id の 1 種類だけになる。

/** 女性（t1）と男性（t2）が同じ時間帯に勤務している状態 */
const twoTherapistShifts = [
  { therapistId: "t1", startTime: "09:00", endTime: "10:00" }, // 佐藤（女性）
  { therapistId: "t2", startTime: "09:00", endTime: "10:00" }, // 鈴木（男性）
];

test("施術者を指定すると、その人が割り当てられる", () => {
  const sato = getAvailableSlots({
    shifts: twoTherapistShifts,
    beds,
    therapists,
    reservations: [],
    treatmentMin: 45,
    therapistIds: ["t1"],
  });
  assert.equal(sato.length, 1);
  assert.equal(sato[0].therapistId, "t1");

  // 先頭にいない人を指定しても枠が出ること（「最初に空いている人」を返してしまわない）
  const suzuki = getAvailableSlots({
    shifts: twoTherapistShifts,
    beds,
    therapists,
    reservations: [],
    treatmentMin: 45,
    therapistIds: ["t2"],
  });
  assert.equal(suzuki.length, 1);
  assert.equal(suzuki[0].therapistId, "t2");
});

test("指定した施術者が勤務していなければ枠は出ない", () => {
  const slots = getAvailableSlots({
    shifts: [{ therapistId: "t2", startTime: "09:00", endTime: "10:00" }], // 鈴木だけ勤務
    beds,
    therapists,
    reservations: [],
    treatmentMin: 45,
    therapistIds: ["t1"], // 勤務していない佐藤を指定
  });
  assert.equal(slots.length, 0);
});

test("指定した施術者が予約で埋まっていれば、他の人が空いていても枠は出ない", () => {
  const slots = getAvailableSlots({
    shifts: twoTherapistShifts,
    beds,
    therapists,
    reservations: [
      // 佐藤だけ埋まっている。鈴木は空いているが、指定していないので割り当ててはいけない
      { bedId: "b1", therapistId: "t1", startTime: "09:00", blockEndTime: "10:00" },
    ],
    treatmentMin: 45,
    therapistIds: ["t1"],
  });
  assert.equal(slots.length, 0);
});

test("2 人以上を選んでいれば、1 人が埋まっていても別の人で枠が残る", () => {
  const slots = getAvailableSlots({
    shifts: twoTherapistShifts,
    beds,
    therapists,
    reservations: [
      { bedId: "b1", therapistId: "t1", startTime: "09:00", blockEndTime: "10:00" },
    ],
    treatmentMin: 45,
    therapistIds: ["t1", "t2"],
  });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].therapistId, "t2");
});

test("1 人も選ばれていなければ（空配列）枠は出ない", () => {
  const slots = getAvailableSlots({
    shifts: twoTherapistShifts,
    beds,
    therapists,
    reservations: [],
    treatmentMin: 45,
    therapistIds: [],
  });
  assert.equal(slots.length, 0);
});

test("指定を省略すれば絞り込みなしとして扱う（空配列とは意味が違う）", () => {
  const slots = getAvailableSlots({
    shifts: [{ therapistId: "t1", startTime: "09:00", endTime: "10:00" }],
    beds,
    therapists,
    reservations: [],
    treatmentMin: 45,
  });
  assert.equal(slots.length, 1);
});

// --- 過ぎた時間の枠を出さない（notBefore） ---

test("notBefore を渡すと、その時刻より後に始まる枠だけが出る", () => {
  const slots = getAvailableSlots({
    shifts: oneHourShift, // 9:00〜10:00
    beds,
    therapists,
    reservations: [],
    treatmentMin: 15, // 枠 30 分 → 本来は 9:00 / 9:15 / 9:30
    notBefore: "09:15",
  });
  assert.deepEqual(
    slots.map((s) => s.startTime),
    ["09:30"],
  );
});

test("notBefore とちょうど同じ時刻に始まる枠は出さない（境界）", () => {
  const slots = getAvailableSlots({
    shifts: oneHourShift,
    beds,
    therapists,
    reservations: [],
    treatmentMin: 45, // 枠 60 分 → 9:00 の 1 つだけ
    notBefore: "09:00",
  });
  assert.equal(slots.length, 0);
});

test("notBefore を省略すれば時刻では絞らない", () => {
  const slots = getAvailableSlots({
    shifts: oneHourShift,
    beds,
    therapists,
    reservations: [],
    treatmentMin: 15,
  });
  assert.equal(slots.length, 3);
});

// --- F-9: resolveShiftsForDate（基本パターン + 例外からシフトを組み立てる） ---

const WED = "2026-09-09"; // 水曜日
const SAT = "2026-09-12"; // 土曜日

test("例外が無ければ、平日は既定の勤務時間（9:00〜14:00 / 15:00〜20:00）が使われる", () => {
  const shifts = resolveShiftsForDate({
    date: WED,
    therapists: [{ id: "t1" }],
    workHours: [],
    absences: [],
  });
  assert.deepEqual(shifts, [
    { therapistId: "t1", startTime: "09:00", endTime: "14:00" },
    { therapistId: "t1", startTime: "15:00", endTime: "20:00" },
  ]);
});

test("例外が無ければ、土日は既定の出勤日ではないのでシフトが無い", () => {
  const shifts = resolveShiftsForDate({
    date: SAT,
    therapists: [{ id: "t1" }],
    workHours: [],
    absences: [],
  });
  assert.deepEqual(shifts, []);
});

test("個別の例外（午前のみ）があれば、既定ではなくその行だけが使われる", () => {
  const shifts = resolveShiftsForDate({
    date: WED,
    therapists: [{ id: "t1" }],
    workHours: [
      { therapistId: "t1", dayOfWeek: 3, startAt: timeOfDay("09:00"), endAt: timeOfDay("14:00") },
    ],
    absences: [],
  });
  assert.deepEqual(shifts, [{ therapistId: "t1", startTime: "09:00", endTime: "14:00" }]);
});

test("例外を持つ人は、行の無い曜日には既定も使われずシフトが無い", () => {
  const shifts = resolveShiftsForDate({
    date: WED, // dayOfWeek = 3
    therapists: [{ id: "t1" }],
    workHours: [
      // 月曜（dayOfWeek = 1）の行しか無い
      { therapistId: "t1", dayOfWeek: 1, startAt: timeOfDay("09:00"), endAt: timeOfDay("14:00") },
    ],
    absences: [],
  });
  assert.deepEqual(shifts, []);
});

test("欠勤が重なる分だけ勤務時間から取り除かれる", () => {
  const shifts = resolveShiftsForDate({
    date: WED,
    therapists: [{ id: "t1" }],
    workHours: [],
    absences: [
      { therapistId: "t1", startAt: toDateTime(WED, "09:00"), endAt: toDateTime(WED, "09:30") },
    ],
  });
  assert.deepEqual(shifts, [
    { therapistId: "t1", startTime: "09:30", endTime: "14:00" },
    { therapistId: "t1", startTime: "15:00", endTime: "20:00" },
  ]);
});

test("別の日の欠勤は影響しない", () => {
  const shifts = resolveShiftsForDate({
    date: WED,
    therapists: [{ id: "t1" }],
    workHours: [],
    absences: [
      // 前日の欠勤
      { therapistId: "t1", startAt: toDateTime("2026-09-08", "09:00"), endAt: toDateTime("2026-09-08", "14:00") },
    ],
  });
  assert.deepEqual(shifts, [
    { therapistId: "t1", startTime: "09:00", endTime: "14:00" },
    { therapistId: "t1", startTime: "15:00", endTime: "20:00" },
  ]);
});

// ---------------------------------------------------------------------------
// 担当の割り当て（偏りをならす）
// ---------------------------------------------------------------------------

const threeTherapists = [
  { id: "t1", name: "佐藤", gender: "female" },
  { id: "t2", name: "鈴木", gender: "male" },
  { id: "t3", name: "高橋", gender: "male" },
];
const threeShifts = [
  { therapistId: "t1", startTime: "09:00", endTime: "12:00" },
  { therapistId: "t2", startTime: "09:00", endTime: "12:00" },
  { therapistId: "t3", startTime: "09:00", endTime: "12:00" },
];

test("全員まだ担当が無いときは、時間帯ごとに担当が入れ替わる（先頭の人に寄らない）", () => {
  const slots = getAvailableSlots({
    shifts: threeShifts,
    beds,
    therapists: threeTherapists,
    reservations: [],
    treatmentMin: 15,
  });

  assert.deepEqual(
    slots.slice(0, 4).map((s) => `${s.startTime}:${s.therapistId}`),
    ["09:00:t1", "09:15:t2", "09:30:t3", "09:45:t1"],
    "9:00 から順に t1 → t2 → t3 と回り、4 つ目でまた t1 に戻る",
  );
});

test("その日すでに担当が入っている人は後回しになる", () => {
  // t1 だけ 9:00〜10:00（枠 60 分）の担当が入っている日。
  // 10:00 以降の枠は、まだ担当が無い t2 / t3 から割り当たる
  const slots = getAvailableSlots({
    shifts: threeShifts,
    beds,
    therapists: threeTherapists,
    reservations: [{ bedId: "b1", therapistId: "t1", startTime: "09:00", blockEndTime: "10:00" }],
    treatmentMin: 15,
  });

  const after10 = slots.filter((s) => toMinutes(s.startTime) >= toMinutes("10:00"));
  assert.ok(after10.length >= 4, "10 時以降の枠があること");
  assert.equal(
    after10.slice(0, 4).some((s) => s.therapistId === "t1"),
    false,
    "担当時間が多い t1 は、他に空いている人がいる限り選ばれない",
  );
});

test("担当時間が並んだら、少ない方が選ばれる", () => {
  // t2 は 30 分ぶん、t3 は 60 分ぶんすでに担当している。t1 は 2 人より多い 75 分。
  // 11:00 の枠は、いちばん少ない t2 に割り当たる
  const slots = getAvailableSlots({
    shifts: threeShifts,
    beds,
    therapists: threeTherapists,
    reservations: [
      { bedId: "b1", therapistId: "t1", startTime: "09:00", blockEndTime: "10:15" },
      { bedId: "b2", therapistId: "t2", startTime: "09:00", blockEndTime: "09:30" },
      { bedId: "b3", therapistId: "t3", startTime: "09:00", blockEndTime: "10:00" },
    ],
    treatmentMin: 15,
  });

  const eleven = slots.find((s) => s.startTime === "11:00");
  assert.ok(eleven, "11:00 の枠があること");
  assert.equal(eleven.therapistId, "t2", "担当 30 分の t2 が、60 分の t3・75 分の t1 より先に選ばれる");
});

test("性別で絞り込んでいるときも、その中で偏りをならす", () => {
  const slots = getAvailableSlots({
    shifts: threeShifts,
    beds,
    therapists: threeTherapists,
    reservations: [],
    treatmentMin: 15,
    genders: ["male"],
  });

  assert.deepEqual(
    slots.slice(0, 3).map((s) => s.therapistId),
    ["t2", "t3", "t2"],
    "男性 2 人（t2 / t3）の間で交互に回る。女性の t1 は選ばれない",
  );
});

// ---------------------------------------------------------------------------
// 指名された人が本当に対応できるかの確認（canAssignTherapist）
// ---------------------------------------------------------------------------

test("指名: 勤務していて予約も無ければ true", () => {
  assert.equal(
    canAssignTherapist({
      shifts: threeShifts,
      reservations: [],
      therapistId: "t1",
      startTime: "09:00",
      blockEndTime: "09:30",
    }),
    true,
  );
});

test("指名: その時間に予約が入っていれば false", () => {
  assert.equal(
    canAssignTherapist({
      shifts: threeShifts,
      reservations: [{ bedId: "b1", therapistId: "t1", startTime: "09:15", blockEndTime: "09:45" }],
      therapistId: "t1",
      startTime: "09:00",
      blockEndTime: "09:30",
    }),
    false,
    "9:15〜9:45 の予約と 9:00〜9:30 の枠は重なる",
  );
});

test("指名: 勤務時間から少しでもはみ出せば false", () => {
  assert.equal(
    canAssignTherapist({
      shifts: threeShifts, // 12:00 まで
      reservations: [],
      therapistId: "t1",
      startTime: "11:45",
      blockEndTime: "12:15",
    }),
    false,
  );
});

test("指名: その日に勤務していない人なら false", () => {
  assert.equal(
    canAssignTherapist({
      shifts: [{ therapistId: "t1", startTime: "09:00", endTime: "12:00" }],
      reservations: [],
      therapistId: "t2",
      startTime: "09:00",
      blockEndTime: "09:30",
    }),
    false,
  );
});
