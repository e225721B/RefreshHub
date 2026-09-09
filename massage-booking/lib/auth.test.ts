// F-8 の確認: 権限の無いユーザーで呼ぶとエラーになることを確かめる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthError, requireRole } from "./auth";
import { type CookieJar, login } from "./session";

function memoryJar(): CookieJar {
  const store = new Map<string, string>();
  return {
    get: (name) => store.get(name),
    set: (name, value) => store.set(name, value),
    delete: (name) => store.delete(name),
  };
}

const SEED_PASSWORD = "password1234"; // pragma: allowlist secret

test("admin ロールのユーザーは requireRole(['admin']) を通る", async () => {
  const jar = memoryJar();
  await login(jar, "admin@example.com", SEED_PASSWORD);
  const user = await requireRole(["admin"], jar);
  assert.equal(user.role, "admin");
});

test("admin でないユーザーが requireRole(['admin']) を呼ぶと AuthError になる", async () => {
  const jar = memoryJar();
  await login(jar, "user1@example.com", SEED_PASSWORD); // role: user
  await assert.rejects(() => requireRole(["admin"], jar), AuthError);
});

test("ログインしていない状態で requireRole を呼ぶと AuthError になる", async () => {
  const jar = memoryJar();
  await assert.rejects(() => requireRole(["admin"], jar), AuthError);
});

test("複数ロールを許可でき、そのいずれかなら通る", async () => {
  const jar = memoryJar();
  await login(jar, "therapist-a@example.com", SEED_PASSWORD); // role: therapist
  const user = await requireRole(["admin", "therapist"], jar);
  assert.equal(user.role, "therapist");
});
