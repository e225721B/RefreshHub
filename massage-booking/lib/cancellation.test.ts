import { test } from "node:test";
import assert from "node:assert/strict";
import { canUserCancel } from "./cancellation";

const startAt = new Date("2026-09-09T14:00:00");

test("施術開始の2時間より前ならキャンセルできる", () => {
  const now = new Date("2026-09-09T11:59:59");
  assert.equal(canUserCancel(startAt, now), true);
});

test("施術開始のちょうど2時間前ちょうどはキャンセルできない（境界は締切側に含む）", () => {
  const now = new Date("2026-09-09T12:00:00");
  assert.equal(canUserCancel(startAt, now), false);
});

test("施術開始の2時間を切っているとキャンセルできない", () => {
  const now = new Date("2026-09-09T12:00:01");
  assert.equal(canUserCancel(startAt, now), false);
});

test("施術開始後はキャンセルできない", () => {
  const now = new Date("2026-09-09T14:30:00");
  assert.equal(canUserCancel(startAt, now), false);
});
