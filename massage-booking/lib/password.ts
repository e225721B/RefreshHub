// パスワードのハッシュ化。PoC だが平文保存は避ける（追加の依存無しで Node 標準の scrypt を使う）。
// D-1 のとおり本番は社内アカウント DB と連携する前提で、ここは簡易実装。

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

/** "salt:hash"（どちらも hex）の形で 1 つの文字列にして User.password に保存する */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(plain, salt, KEY_LENGTH);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
