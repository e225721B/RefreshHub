// ログインの仕組み（F-6）。Cookie でログイン中のユーザー ID を保持するだけの簡易実装。
// なりすまし防止のための署名やセッションストアは持たない（PoC として受け入れるリスク。design.md 参照）。
//
// Cookie の読み書きを CookieJar として抽象化しているのは、
// next/headers の cookies() が Next.js のリクエスト文脈でしか使えず、
// このファイル単体をテスト（lib/session.test.ts）できないため。

import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

export const SESSION_COOKIE = "session_user_id";

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

/** メールアドレス + パスワードでログインする（AC-16） */
export async function login(jar: CookieJar, email: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !verifyPassword(password, user.password)) {
    return { ok: false, message: "メールアドレスまたはパスワードが正しくありません" };
  }
  jar.set(SESSION_COOKIE, user.id);
  // ログイン直後の行き先を role で変えるため（管理者は管理画面へ）、本人の情報を返す
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

export function logout(jar: CookieJar): void {
  jar.delete(SESSION_COOKIE);
}

/** ログイン中のユーザーを取得する。無効化されたアカウントは未ログイン扱いにする */
export async function getCurrentUser(jar: CookieJar): Promise<SessionUser | null> {
  const userId = jar.get(SESSION_COOKIE);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) return null;
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
