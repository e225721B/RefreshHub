"use server";

import { redirect } from "next/navigation";
import { landingFor } from "@/lib/roles";
import { login as loginUser, logout as logoutUser, nextCookieJar } from "@/lib/session";

export type LoginState = { error: string | null };

/**
 * ログイン後の戻り先。アプリ内のパスだけを許す。
 * "https://..." のような値をそのまま使うと、別サイトへ飛ばす踏み台にされるため。
 */
function safeNext(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/** ログイン画面のフォームから呼ばれる（A-1 / AC-16） */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください" };
  }

  // 照合とCookieの発行は lib/session.ts に任せる（F-6 で実装済み・テスト済み）
  const jar = await nextCookieJar();
  const result = await loginUser(jar, email, password);
  if (!result.ok) return { error: result.message };

  // next が指定されていない（＝ /login を直接開いた）場合は role ごとの既定の着地先へ送る
  // （管理者は /admin、マッサージ師は /therapist、それ以外は /）。
  // next が指定されているとき（例: 権限の無い画面を開こうとしてログインに飛ばされた場合）はそちらを優先する。
  redirect(next === "/" ? landingFor(result.user.role) : next);
}

export async function logout() {
  logoutUser(await nextCookieJar());
  redirect("/login");
}
