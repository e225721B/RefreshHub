"use server";

// ユーザー管理の Server Action（AC-17 / A-4・A-5）。
// 自己登録は作らず、管理者だけがアカウントを登録する（design.md の D-1）。
// 画面を管理者にしか見せない作りにしていても、Server Action は直接呼べてしまう。
// そのため、ここでも必ず role を確認する（F-8）。
//
// 検証と DB への書き込みは lib/users.ts に置き、この層はフォームの読み取りだけを担当する。

import { revalidatePath } from "next/cache";
import { AuthError, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/roles";
import type { Gender } from "@/lib/slots";
import {
  countUserHistory,
  createUserAccount,
  deleteUserAccount,
  reactivateUserAccount,
  type UserHistory,
} from "@/lib/users";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  gender: Gender;
  /** 一覧に「利用実績」として見せる。削除の可否には使わない（削除は常に論理削除） */
  history: UserHistory;
  canDelete: boolean;
};

/** 登録できたときだけ、本人に渡す初期パスワードを画面に返す（保存されるのはハッシュのみ） */
export type CreateUserState = {
  error: string | null;
  created: { name: string; email: string; role: Role; password: string } | null;
};

/** ユーザー一覧（AC-17）。マッサージ師は性別も一緒に見えるようにする */
export async function listUsers(): Promise<UserRow[]> {
  const me = await requireRole(["admin"]);
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  const activeAdmins = users.filter((u) => u.role === "admin" && u.active).length;

  return Promise.all(
    users.map(async (u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      gender: u.gender as Gender,
      history: await countUserHistory(u.id),
      // 実際の可否は deleteUserAccount でも確かめる。ここはボタンを出すかどうかの判断。
      // 自分自身と、有効な管理者が最後の 1 人のときのその管理者は削除できない
      canDelete: u.id !== me.id && !(u.role === "admin" && u.active && activeAdmins <= 1),
    })),
  );
}

/** モーダルのフォームから呼ばれる（A-5） */
export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  try {
    await requireRole(["admin"]);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, created: null };
    throw e;
  }

  // 初期パスワードはフォームから受け取らない。lib/users.ts がサーバ側で作る
  const result = await createUserAccount({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
    gender: String(formData.get("gender") ?? ""),
  });

  if (!result.ok) return { error: result.message, created: null };

  revalidatePath("/admin");
  revalidatePath("/admin/users");

  // 初期パスワードは平文で保存していないので、この 1 回だけ画面に返す。
  // 管理者がここから本人へ手渡し・DM で伝える（D-1 の運用）。
  return {
    error: null,
    created: {
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
      password: result.password,
    },
  };
}

/** 一覧の「削除」「有効に戻す」から呼ばれる。結果の文言はそのまま画面に出す */
export type UserActionState = { error: string | null; message: string | null };

export async function deleteUser(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  let me;
  try {
    me = await requireRole(["admin"]);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, message: null };
    throw e;
  }

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "対象のユーザーが指定されていません", message: null };

  const result = await deleteUserAccount(me.id, userId);
  if (!result.ok) return { error: result.message, message: null };

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/stats");
  return {
    error: null,
    // 論理削除なので「消えた」と言い切らない。何が起きたかをそのまま書く
    message: `${result.name} を削除しました（ログインできなくなります。過去の予約と集計は残ります）`,
  };
}

export async function reactivateUser(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  try {
    await requireRole(["admin"]);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, message: null };
    throw e;
  }

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "対象のユーザーが指定されていません", message: null };

  const result = await reactivateUserAccount(userId);
  if (!result.ok) return { error: result.message, message: null };

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/stats");
  return { error: null, message: `${result.name} を有効に戻しました` };
}
