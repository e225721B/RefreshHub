import { test } from "node:test";
import assert from "node:assert/strict";
import { getAvailableSlots, isStillAvailable, resolveShiftsForDate, toHHMM, toMinutes } from "./slots";
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

test("全ベッドが 10:00〜11:00 で埋まっていても、9:45 開始の 15 分枠は選べる（清掃は自分の施術の後だけでよい）", () => {
  const longShift = [
    { therapistId: "t1", startTime: "09:00", endTime: "12:00" },
    { therapistId: "t2", startTime: "09:00", endTime: "12:00" },
    { therapistId: "t3", startTime: "09:00", endTime: "12:00" },
  ];
  const threeTherapists = [
    ...therapists,
    { id: "t3", name: "高橋", gender: "male" },
  ];
  const threeBeds = beds; // b1, b2, b3 の 3 台
  // 3 人が 10:00 から 45 分（枠は 10:00〜11:00）を、ベッドを 1 台ずつ使って予約している
  const reservations = [
    { bedId: "b1", therapistId: "t1", startTime: "10:00", blockEndTime: "11:00" },
    { bedId: "b2", therapistId: "t2", startTime: "10:00", blockEndTime: "11:00" },
    { bedId: "b3", therapistId: "t3", startTime: "10:00", blockEndTime: "11:00" },
  ];

  const slots = getAvailableSlots({
    shifts: longShift,
    beds: threeBeds,
    therapists: threeTherapists,
    reservations,
    treatmentMin: 15,
  });
  const startTimes = slots.map((s) => s.startTime);

  // 9:45（施術は 9:45〜10:00 で終わる）は選べる
  assert.ok(startTimes.includes("09:45"), "9:45 は選べること");
  // 10:00〜10:45 は引き続き選べない（実際に埋まっている時間帯）
  assert.deepEqual(
    startTimes.filter((t) => t >= "10:00" && t < "11:00"),
    [],
    "10:00〜11:00 の間は選べないこと",
  );
});

test("保存直前の確認: 同じベッドが埋まっていれば false", () => {
  const ok = isStillAvailable({
    reservations: [
      { bedId: "b1", therapistId: "t2", startTime: "09:00", blockEndTime: "09:30" },
    ],
    bedId: "b1",
    therapistId: "t1",
    startTime: "09:15",
    treatmentMin: 15,
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
    treatmentMin: 15,
  });
  assert.equal(ok, true);
});

test("保存直前の確認: 自分の清掃時間が次の予約の開始と重なっていても true（清掃は自分の施術の後だけでよい）", () => {
  const ok = isStillAvailable({
    reservations: [
      // 10:00 開始・施術 45 分（枠は 10:00〜11:00）の予約が同じベッドに入っている
      { bedId: "b1", therapistId: "t2", startTime: "10:00", blockEndTime: "11:00" },
    ],
    bedId: "b1",
    therapistId: "t1",
    startTime: "09:45", // 施術 15 分なら治療は 9:45〜10:00 で終わり、次の予約とは重ならない
    treatmentMin: 15,
  });
  assert.equal(ok, true);
});

test("性別を指定すると、その性別の空いている施術者が割り当てられる", () => {
  const shifts = [
    { therapistId: "t1", startTime: "09:00", endTime: "10:00" }, // 女性
    { therapistId: "t2", startTime: "09:00", endTime: "10:00" }, // 男性
  ];
  const female = getAvailableSlots({
    shifts,
    beds,
    therapists,
    reservations: [],
    treatmentMin: 45,
    genders: ["female"],
  });
  assert.equal(female.length, 1);
  assert.equal(female[0].therapistId, "t1");

  // 男性を指定しても枠が出ること（女性が先頭にいても 0 件にならない）
  const male = getAvailableSlots({
    shifts,
    beds,
    therapists,
    reservations: [],
    treatmentMin: 45,
    genders: ["male"],
  });
  assert.equal(male.length, 1);
  assert.equal(male[0].therapistId, "t2");
});

test("指定した性別の施術者が勤務していなければ枠は出ない", () => {
  const slots = getAvailableSlots({
    shifts: [{ therapistId: "t2", startTime: "09:00", endTime: "10:00" }], // 男性のみ
    beds,
    therapists,
    reservations: [],
    treatmentMin: 45,
    genders: ["female"],
  });
  assert.equal(slots.length, 0);
});

test("女性と男性の両方にチェックを入れると、どちらの施術者でも枠が出る", () => {
  const shifts = [
    { therapistId: "t1", startTime: "09:00", endTime: "10:00" }, // 女性
    { therapistId: "t2", startTime: "09:00", endTime: "10:00" }, // 男性
  ];
  const both = getAvailableSlots({
    shifts,
    beds,
    therapists,
    reservations: [
      // 女性が埋まっていても、男性が空いていれば枠は残る
      { bedId: "b1", therapistId: "t1", startTime: "09:00", blockEndTime: "10:00" },
    ],
    treatmentMin: 45,
    genders: ["female", "male"],
  });
  assert.equal(both.length, 1);
  assert.equal(both[0].therapistId, "t2");
});

test("チェックが空なら絞り込みなしとして扱う", () => {
  const slots = getAvailableSlots({
    shifts: [{ therapistId: "t1", startTime: "09:00", endTime: "10:00" }],
    beds,
    therapists,
    reservations: [],
    treatmentMin: 45,
    genders: [],
  });
  assert.equal(slots.length, 1);
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
