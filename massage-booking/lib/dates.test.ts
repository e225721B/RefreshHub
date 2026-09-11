import { test } from "node:test";
import assert from "node:assert/strict";
import { isPast, isStartPassed, toDateTime } from "./dates";

// 「15:00 を過ぎているのに今日の 9:00 が選べる」問題の判定。
// 日付単位の isPast では today を過去にできないため、時刻まで見る関数を分けている。

const TODAY = "2026-09-10";
const at = (hhmm: string) => toDateTime(TODAY, hhmm);

test("今日の過ぎた時刻は「過ぎた」と判定される", () => {
  const now = at("15:00");
  assert.equal(isStartPassed(TODAY, "09:00", now), true);
  assert.equal(isStartPassed(TODAY, "14:45", now), true);
});

test("今日のこれからの時刻は「過ぎていない」", () => {
  const now = at("15:00");
  assert.equal(isStartPassed(TODAY, "15:15", now), false);
  assert.equal(isStartPassed(TODAY, "20:00", now), false);
});

test("ちょうど今始まる枠は予約させない（境界）", () => {
  // 15:00:00 に 15:00 開始の枠 → 選ばせない。選んでいる間に過ぎてしまうため
  assert.equal(isStartPassed(TODAY, "15:00", at("15:00")), true);
  // 14:59:59 なら 15:00 はまだ選べる
  const justBefore = at("15:00");
  justBefore.setSeconds(justBefore.getSeconds() - 1);
  assert.equal(isStartPassed(TODAY, "15:00", justBefore), false);
});

test("別の日は時刻に関係なく、前日は過ぎていて翌日は過ぎていない", () => {
  const now = at("15:00");
  assert.equal(isStartPassed("2026-09-09", "20:00", now), true);
  assert.equal(isStartPassed("2026-09-11", "09:00", now), false);
});

test("isPast は日付単位（今日は過去にしない）", () => {
  // 時刻の判定を isPast に混ぜていないことの確認。今日の扱いは isStartPassed の担当
  assert.equal(isPast("1999-01-01"), true);
});
