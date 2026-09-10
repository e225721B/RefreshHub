// A-5 の確認: 自動生成した初期パスワードが、そのまま登録に使える強さになっていること。

import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePassword, isValidPassword, PASSWORD_MIN_LENGTH } from "./generate-password";

test("自動生成したパスワードは、そのまま登録の条件を満たす", () => {
  for (let i = 0; i < 200; i++) {
    const p = generatePassword();
    assert.ok(isValidPassword(p), `条件を満たさない値が出た: ${p}`);
  }
});

test("読み違えやすい文字（l I 1 O 0）を含まない", () => {
  for (let i = 0; i < 200; i++) {
    const p = generatePassword();
    assert.doesNotMatch(p, /[lI1O0]/, `読み違えやすい文字が入っている: ${p}`);
  }
});

test("毎回違う値になる", () => {
  const values = new Set(Array.from({ length: 100 }, () => generatePassword()));
  assert.equal(values.size, 100);
});

test("短すぎる・数字が無い・英字が無いパスワードは弾く", () => {
  assert.equal(isValidPassword("Ab3"), false, "短すぎる");
  assert.equal(isValidPassword("abcdefghij"), false, "数字が無い");
  assert.equal(isValidPassword("2345678923"), false, "英字が無い");
  assert.equal(isValidPassword("abcdefg1"), true, `${PASSWORD_MIN_LENGTH} 文字・英数字あり`);
});
