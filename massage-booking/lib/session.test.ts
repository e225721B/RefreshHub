// F-6 の確認: ログイン → 取得 → ログアウトが通ることを、シードデータに対して確かめる。
// next/headers の Cookie は Next.js のリクエスト文脈でしか使えないため、
// テストでは in-memory な CookieJar を使う（lib/session.ts の CookieJar 抽象化）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { type CookieJar, getCurrentUser, login, logout } from "./session";

/** テスト用の in-memory CookieJar */
function memoryJar(): CookieJar {
  const store = new Map<string, string>();
  return {
    get: (name) => store.get(name),
    set: (name, value) => store.set(name, value),
    delete: (name) => store.delete(name),
  };
}

const ADMIN_EMAIL = "admin@example.com";
const SEED_PASSWORD = "password1234";

test("正しいメールアドレス・パスワードでログインできる", async () => {
  const jar = memoryJar();
  const result = await login(jar, ADMIN_EMAIL, SEED_PASSWORD);
  assert.equal(result.ok, true);
});

test("ログイン後、getCurrentUser でログイン中のユーザーが取得できる", async () => {
  const jar = memoryJar();
  await login(jar, ADMIN_EMAIL, SEED_PASSWORD);
  const user = await getCurrentUser(jar);
  assert.ok(user, "ログイン中のユーザーが取得できること");
  assert.equal(user?.email, ADMIN_EMAIL);
  assert.equal(user?.role, "admin");
});

test("ログアウトすると getCurrentUser が null を返す", async () => {
  const jar = memoryJar();
  await login(jar, ADMIN_EMAIL, SEED_PASSWORD);
  logout(jar);
  const user = await getCurrentUser(jar);
  assert.equal(user, null);
});

test("パスワードが間違っていればログインできない", async () => {
  const jar = memoryJar();
  const result = await login(jar, ADMIN_EMAIL, "wrong-password");
  assert.equal(result.ok, false);
});

test("存在しないメールアドレスではログインできない", async () => {
  const jar = memoryJar();
  const result = await login(jar, "nobody@example.com", SEED_PASSWORD);
  assert.equal(result.ok, false);
});

test("Cookie が無ければ getCurrentUser は null を返す", async () => {
  const jar = memoryJar();
  const user = await getCurrentUser(jar);
  assert.equal(user, null);
});
