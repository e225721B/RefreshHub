"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, login as loginUser, logout as logoutUser, nextCookieJar } from "@/lib/session";

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

  // next が指定されていない（＝ /login を直接開いた）場合、マッサージ師は
  // 予約画面を挟まず /therapist へ直接送る。next が指定されているとき
  // （例: /therapist から未ログインで弾かれた場合の ?next=%2Ftherapist）はそちらを優先する。
  if (next === "/") {
    const user = await getCurrentUser(jar);
    if (user?.role === "therapist") redirect("/therapist");
  }
  redirect(next);
}

export async function logout() {
  logoutUser(await nextCookieJar());
  redirect("/login");
}
