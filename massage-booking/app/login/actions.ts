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
  const result = await loginUser(await nextCookieJar(), email, password);
  if (!result.ok) return { error: result.message };

  // 管理者は自分で予約を取る立場ではないので、予約画面ではなく管理画面へ送る。
  // 行き先が指定されている場合（権限の無い画面を開こうとしてログインに飛ばされた等）はそちらを優先する。
  redirect(next === "/" ? landingFor(result.user.role) : next);
}

export async function logout() {
  logoutUser(await nextCookieJar());
  redirect("/login");
}
