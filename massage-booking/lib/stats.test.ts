// A-2（/admin/stats）の確認: 集計の数え方を固定する。
// DB には触らない。予約の一覧を手で作って aggregate() に渡し、出てくる数字を確かめる。
//
// 特に I-6（AC-6）「同じ人が 3 回予約しても 1 人と数えられる」は、
// 画面を見ただけでは間違いに気づけないため、必ずテストで押さえる。

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregate,
  bucketKeyOf,
  daysBetween,
  DEFAULT_RANGE_DAYS,
  enumerateBuckets,
  formatMinutes,
  MAX_RANGE_DAYS,
  normalizeRange,
  pickGranularity,
  type StatsReservation,
} from "./stats";
import { shiftDate, todayString } from "./dates";

const BEDS = [
  { id: "b1", name: "ベッド A" },
  { id: "b2", name: "ベッド B" },
  { id: "b3", name: "ベッド C" },
];

/** テスト用の予約を 1 件作る。指定しなかったところは無難な既定値 */
function reservation(over: Partial<StatsReservation> & { startAt: Date }): StatsReservation {
  return {
    userId: "u1",
    userName: "利用者 一郎",
    userRole: "user",
    bedId: "b1",
    treatmentMin: 30,
    status: "booked",
    cancelledById: null,
    ...over,
  };
}

const at = (dateStr: string, hhmm: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
};

// --- 期間の決め方 ---------------------------------------------------------

test("期間を指定しなければ、直近 30 日になる", () => {
  const range = normalizeRange(undefined, undefined);
  assert.equal(range.to, todayString());
  assert.equal(range.from, shiftDate(todayString(), -(DEFAULT_RANGE_DAYS - 1)));
  assert.equal(daysBetween(range), DEFAULT_RANGE_DAYS);
});

test("開始日と終了日が逆でも、入れ替えて集計できる", () => {
  const range = normalizeRange("2026-09-30", "2026-09-01");
  assert.deepEqual(range, { from: "2026-09-01", to: "2026-09-30" });
});

test("存在しない日付や壊れた値は無視して既定に戻す", () => {
  assert.equal(normalizeRange("2026-02-31", "2026-09-30").from, shiftDate("2026-09-30", -29));
  assert.equal(normalizeRange("きのう", "2026-09-30").from, shiftDate("2026-09-30", -29));
  assert.equal(normalizeRange("2026-09-01", "でたらめ").to, todayString());
});

test("長すぎる期間は上限で切る（DB から際限なく読まないため）", () => {
  const range = normalizeRange("2000-01-01", "2026-09-30");
  assert.equal(daysBetween(range), MAX_RANGE_DAYS);
  assert.equal(range.to, "2026-09-30");
});

test("同じ日を指定したら 1 日ぶんとして数える", () => {
  assert.equal(daysBetween({ from: "2026-09-10", to: "2026-09-10" }), 1);
});

// --- 横軸の刻み（S-1 の決定） ---------------------------------------------

test("期間の長さで、日別 → 週別 → 月別に切り替わる", () => {
  assert.equal(pickGranularity({ from: "2026-09-01", to: "2026-09-07" }), "day");
  assert.equal(pickGranularity({ from: "2026-09-01", to: "2026-10-01" }), "day"); // 31 日
  assert.equal(pickGranularity({ from: "2026-09-01", to: "2026-10-02" }), "week"); // 32 日
  assert.equal(pickGranularity({ from: "2026-04-01", to: "2026-09-29" }), "week"); // 182 日
  assert.equal(pickGranularity({ from: "2026-04-01", to: "2026-09-30" }), "month"); // 183 日
});

test("どの刻みでも、棒の数は 31 本前後までに収まる", () => {
  for (const to of ["2026-09-07", "2026-10-01", "2026-12-31", "2027-09-10"]) {
    const range = normalizeRange("2026-09-01", to);
    const count = enumerateBuckets(range, pickGranularity(range)).length;
    assert.ok(count <= 32, `${to} で棒が ${count} 本になった`);
  }
});

test("週別は「その週の月曜」、月別は「年-月」でまとめる", () => {
  // 2026-09-10 は木曜。その週の月曜は 2026-09-07
  assert.equal(bucketKeyOf("2026-09-10", "day"), "2026-09-10");
  assert.equal(bucketKeyOf("2026-09-10", "week"), "2026-09-07");
  assert.equal(bucketKeyOf("2026-09-10", "month"), "2026-09");
});

test("予約が 0 件の区間も、棒の場所として残る（グラフに穴を空けない）", () => {
  const keys = enumerateBuckets({ from: "2026-09-01", to: "2026-09-05" }, "day");
  assert.deepEqual(keys, [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
  ]);
});

test("月をまたぐ月別の並びが、年をまたいでも途切れない", () => {
  const keys = enumerateBuckets({ from: "2025-11-15", to: "2026-02-03" }, "month");
  assert.deepEqual(keys, ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

// --- 数え方 ---------------------------------------------------------------

test("同じ人が 3 回予約しても、ユニーク利用者数は 1 人（I-6 / AC-6）", () => {
  const stats = aggregate({
    range: { from: "2026-09-01", to: "2026-09-30" },
    beds: BEDS,
    reservations: [
      reservation({ startAt: at("2026-09-02", "10:00") }),
      reservation({ startAt: at("2026-09-09", "10:00") }),
      reservation({ startAt: at("2026-09-16", "10:00") }),
    ],
  });

  assert.equal(stats.summary.uniqueUsers, 1, "延べ回数を人数として数えている");
  assert.equal(stats.summary.reservations, 3);
  assert.equal(stats.summary.avgPerUser, 3);
});

test("違う人が 1 回ずつ使えば、人数はその人数になる", () => {
  const stats = aggregate({
    range: { from: "2026-09-01", to: "2026-09-30" },
    beds: BEDS,
    reservations: [
      reservation({ userId: "u1", userName: "一郎", startAt: at("2026-09-02", "10:00") }),
      reservation({ userId: "u2", userName: "二郎", startAt: at("2026-09-03", "10:00") }),
      reservation({ userId: "u3", userName: "三郎", startAt: at("2026-09-04", "10:00") }),
    ],
  });

  assert.equal(stats.summary.uniqueUsers, 3);
  assert.equal(stats.summary.avgPerUser, 1);
});

test("キャンセルされた予約は、利用実績のどの数にも入らない（Q-B の決定）", () => {
  const stats = aggregate({
    range: { from: "2026-09-01", to: "2026-09-30" },
    beds: BEDS,
    reservations: [
      reservation({ userId: "u1", startAt: at("2026-09-02", "10:00") }),
      reservation({
        userId: "u2",
        userName: "二郎",
        startAt: at("2026-09-03", "10:00"),
        status: "cancelled",
        cancelledById: "u2",
      }),
    ],
  });

  assert.equal(stats.summary.uniqueUsers, 1, "キャンセルした人を利用者として数えている");
  assert.equal(stats.summary.reservations, 1);
  assert.equal(stats.users.length, 1);
  assert.equal(stats.byHour.find((h) => h.hour === 10)?.count, 1);
  assert.equal(stats.byBed.find((b) => b.bedId === "b1")?.count, 1);
});

test("キャンセル率は、利用者都合と運営都合を分けて数える", () => {
  const stats = aggregate({
    range: { from: "2026-09-01", to: "2026-09-30" },
    beds: BEDS,
    reservations: [
      reservation({ startAt: at("2026-09-02", "10:00") }),
      reservation({ startAt: at("2026-09-03", "10:00") }),
      // 本人が取り消した
      reservation({
        userId: "u1",
        startAt: at("2026-09-04", "10:00"),
        status: "cancelled",
        cancelledById: "u1",
      }),
      // 管理者が取り消した（欠勤による自動キャンセルなど）
      reservation({
        userId: "u2",
        startAt: at("2026-09-05", "10:00"),
        status: "cancelled",
        cancelledById: "u-admin",
      }),
    ],
  });

  assert.equal(stats.summary.cancel.total, 2);
  assert.equal(stats.summary.cancel.byUser, 1);
  assert.equal(stats.summary.cancel.byAdmin, 1);
  assert.equal(stats.summary.cancel.rate, 50, "2 件 ÷ 4 件 = 50%");
});

test("のべ施術時間は施術時間だけを足す（清掃の 15 分は入れない）", () => {
  const stats = aggregate({
    range: { from: "2026-09-01", to: "2026-09-30" },
    beds: BEDS,
    reservations: [
      reservation({ startAt: at("2026-09-02", "10:00"), treatmentMin: 45 }),
      reservation({ startAt: at("2026-09-03", "10:00"), treatmentMin: 15 }),
    ],
  });

  assert.equal(stats.summary.treatmentMin, 60);
  assert.equal(formatMinutes(stats.summary.treatmentMin), "1 時間");
  assert.equal(formatMinutes(45), "45 分");
  assert.equal(formatMinutes(225), "3 時間 45 分");
});

test("期間別グラフでも、同じ人の 2 回は「予約 2 件・1 人」になる", () => {
  const stats = aggregate({
    range: { from: "2026-09-01", to: "2026-09-07" },
    beds: BEDS,
    reservations: [
      reservation({ userId: "u1", startAt: at("2026-09-03", "10:00") }),
      reservation({ userId: "u1", startAt: at("2026-09-03", "16:00") }),
      reservation({ userId: "u2", userName: "二郎", startAt: at("2026-09-05", "10:00") }),
    ],
  });

  const sep3 = stats.period.find((p) => p.key === "2026-09-03");
  assert.equal(sep3?.reservations, 2);
  assert.equal(sep3?.uniqueUsers, 1);

  const sep4 = stats.period.find((p) => p.key === "2026-09-04");
  assert.equal(sep4?.reservations, 0, "予約が無い日が抜け落ちている");

  assert.equal(
    stats.period.reduce((sum, p) => sum + p.reservations, 0),
    3,
    "棒の合計が予約数と合わない",
  );
});

test("期間の外の予約は数えない", () => {
  const stats = aggregate({
    range: { from: "2026-09-01", to: "2026-09-07" },
    beds: BEDS,
    // fetchStats は期間で絞って読むが、集計側でも棒に入れない
    reservations: [reservation({ startAt: at("2026-08-31", "10:00") })],
  });

  assert.equal(
    stats.period.reduce((sum, p) => sum + p.reservations, 0),
    0,
  );
});

test("時間帯別は、休憩の時間帯も 0 件の行として残す", () => {
  const stats = aggregate({
    range: { from: "2026-09-01", to: "2026-09-07" },
    beds: BEDS,
    reservations: [reservation({ startAt: at("2026-09-02", "09:15") })],
  });

  assert.deepEqual(
    stats.byHour.map((h) => h.hour),
    [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  );
  assert.equal(stats.byHour.find((h) => h.hour === 9)?.count, 1, "9:15 は 9 時台");
  assert.equal(stats.byHour.find((h) => h.hour === 14)?.count, 0);
});

test("ベッド別は、1 件も使われなかったベッドも 0 件で出す（偏りを見るため）", () => {
  const stats = aggregate({
    range: { from: "2026-09-01", to: "2026-09-07" },
    beds: BEDS,
    reservations: [
      reservation({ bedId: "b1", startAt: at("2026-09-02", "10:00") }),
      reservation({ bedId: "b1", startAt: at("2026-09-03", "10:00") }),
    ],
  });

  assert.deepEqual(
    stats.byBed.map((b) => [b.name, b.count]),
    [
      ["ベッド A", 2],
      ["ベッド B", 0],
      ["ベッド C", 0],
    ],
  );
});

test("一覧表は利用回数の多い順。名前・最終利用日・のべ時間が付く", () => {
  const stats = aggregate({
    range: { from: "2026-09-01", to: "2026-09-30" },
    beds: BEDS,
    reservations: [
      reservation({ userId: "u2", userName: "二郎", startAt: at("2026-09-02", "10:00") }),
      reservation({ userId: "u1", userName: "一郎", startAt: at("2026-09-03", "10:00") }),
      reservation({ userId: "u1", userName: "一郎", startAt: at("2026-09-08", "10:00") }),
      reservation({
        userId: "u1",
        userName: "一郎",
        startAt: at("2026-09-05", "10:00"),
        treatmentMin: 45,
      }),
    ],
  });

  assert.deepEqual(
    stats.users.map((u) => [u.name, u.count]),
    [
      ["一郎", 3],
      ["二郎", 1],
    ],
  );
  assert.equal(stats.users[0].lastUsedAt, "2026-09-08", "最終利用日が最新になっていない");
  assert.equal(stats.users[0].treatmentMin, 105);
  assert.equal(stats.users[0].userId, "u1", "A-4 へのリンクに使う ID が入っていない");
});

test("予約が 1 件も無い期間でも、0 で表示できる形を返す", () => {
  const stats = aggregate({
    range: { from: "2026-09-01", to: "2026-09-07" },
    beds: BEDS,
    reservations: [],
  });

  assert.equal(stats.summary.uniqueUsers, 0);
  assert.equal(stats.summary.reservations, 0);
  assert.equal(stats.summary.avgPerUser, 0, "0 で割って NaN になっている");
  assert.equal(stats.summary.cancel.rate, 0);
  assert.equal(stats.users.length, 0);
  assert.equal(stats.period.length, 7);
  assert.equal(stats.byBed.length, 3);
});
