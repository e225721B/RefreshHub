// ログインの仕組み（F-6）。Cookie にはランダムな sessionToken だけを入れ、
// user.id そのものは持たせない。認証時は Session テーブルで token → userId を引く。
// Cookie の値をそのまま User.id として信用すると、有効な id さえ知れば
// 誰でもなりすませてしまうため（design.md 参照）。
//
// Cookie の読み書きを CookieJar として抽象化しているのは、
// next/headers の cookies() が Next.js のリクエスト文脈でしか使えず、
// このファイル単体をテスト（lib/session.test.ts）できないため。

import { randomBytes } from "node:crypto";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

export const SESSION_COOKIE = "session_token";

// セッションの有効期限。切れたら再ログインが必要（AC-16）。
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
  delete(name: string): void;
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; message: string };

/** 推測されないよう、暗号学的に安全な乱数からセッショントークンを作る */
function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** メールアドレス + パスワードでログインする（AC-16） */
export async function login(jar: CookieJar, email: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !verifyPassword(password, user.password)) {
    return { ok: false, message: "メールアドレスまたはパスワードが正しくありません" };
  }
  const token = generateSessionToken();
  await prisma.session.create({
    data: { token, userId: user.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  jar.set(SESSION_COOKIE, token);
  // ログイン直後の行き先を role で変えるため（管理者は管理画面へ）、本人の情報を返す
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

export async function logout(jar: CookieJar): Promise<void> {
  const token = jar.get(SESSION_COOKIE);
  jar.delete(SESSION_COOKIE);
  if (!token) return;
  // Cookie を消すだけだと token 自体はまだ有効なままなので、サーバー側でも失効させる
  await prisma.session.deleteMany({ where: { token } });
}

/** ログイン中のユーザーを取得する。セッション切れ・無効化されたアカウントは未ログイン扱いにする */
export async function getCurrentUser(jar: CookieJar): Promise<SessionUser | null> {
  const token = jar.get(SESSION_COOKIE);
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  const { user } = session;
  if (!user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/** Next.js の Server Action / Server Component から使う実際の CookieJar */
export async function nextCookieJar(): Promise<CookieJar> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return {
    get: (name) => store.get(name)?.value,
    set: (name, value) => store.set(name, value, { httpOnly: true, sameSite: "lax", path: "/" }),
    delete: (name) => store.delete(name),
  };
}

/**
 * 実 Cookie 経由でログイン中のユーザーを取得する。layout・ページ・Server Action など
 * 1 リクエストの中で何度も呼ばれるため、React の cache() でリクエスト単位にまとめ、
 * Session テーブルへの問い合わせが毎回発生しないようにする。
 * テストで in-memory な CookieJar を使いたい場合は getCurrentUser を直接使うこと。
 */
export const getCurrentUserForRequest = cache(async (): Promise<SessionUser | null> => {
  return getCurrentUser(await nextCookieJar());
});
