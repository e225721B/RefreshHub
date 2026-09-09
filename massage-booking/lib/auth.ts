// 権限チェックの共通関数（F-8）。
// 画面を隠すだけでなく、Server Action の側でも必ず role を確認する。
// 画面の出し分けだけでは URL 直打ち・直接の関数呼び出しで通ってしまうため。

import { type CookieJar, getCurrentUser, nextCookieJar, type SessionUser } from "@/lib/session";

export type Role = SessionUser["role"];

export class AuthError extends Error {}

/**
 * ログイン済みで、かつ指定した role のいずれかであることを確認する。
 * 満たさなければ AuthError を投げる（Server Action はこれを捕まえてエラー表示する）。
 *
 * jar を省略すると実際の Cookie（next/headers）を見る。
 * テストでは in-memory な CookieJar を渡して確認できる。
 */
export async function requireRole(roles: Role[], jar?: CookieJar): Promise<SessionUser> {
  const cookieJar = jar ?? (await nextCookieJar());
  const user = await getCurrentUser(cookieJar);
  if (!user) throw new AuthError("ログインが必要です");
  if (!roles.includes(user.role)) throw new AuthError("この操作を行う権限がありません");
  return user;
}

/** ログイン済みでありさえすればよい場合 */
export async function requireLogin(jar?: CookieJar): Promise<SessionUser> {
  const cookieJar = jar ?? (await nextCookieJar());
  const user = await getCurrentUser(cookieJar);
  if (!user) throw new AuthError("ログインが必要です");
  return user;
}
