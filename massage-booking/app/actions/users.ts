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
import type { Prisma } from "@prisma/client";
import { isRole, type Role } from "@/lib/roles";
import type { Gender } from "@/lib/slots";
import { createUserAccount, deleteUserAccount, reactivateUserAccount } from "@/lib/users";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  gender: Gender;
  /**
   * 合計利用回数（本人がマッサージを受けた回数）。
   * キャンセル分は数えない（集計画面と同じ数え方。design.md の Q-B）。
   * 内訳（担当・通知・キャンセル操作…）は出さない。増え続ける数字を並べても一覧が読みにくくなるだけで、
   * 削除の可否にも使わなくなったため（削除は常に論理削除）。
   */
  usageCount: number;
  canDelete: boolean;
};

/** 一覧の絞り込み。ユーザーが増えても 1 画面が読める量に収める */
export type UserListOptions = {
  /** 削除済み（active = false）も含めるか */
  includeDeleted?: boolean;
  /** 氏名・メールアドレスの部分一致 */
  q?: string;
  /** "user" | "therapist" | "admin"。それ以外は「すべて」として扱う */
  role?: string;
  /** 1 始まり。範囲外は端に丸める */
  page?: number;
};

export type UserListResult = {
  users: UserRow[];
  /** 絞り込み後の総件数（ページングの前） */
  total: number;
  page: number;
  pageCount: number;
  perPage: number;
};

/** 登録できたときだけ、本人に渡す初期パスワードを画面に返す（保存されるのはハッシュのみ） */
export type CreateUserState = {
  error: string | null;
  created: { name: string; email: string; role: Role; password: string } | null;
};

/**
 * ユーザー一覧（AC-17）。マッサージ師は性別も一緒に見えるようにする。
 *
 * 将来 700 人規模になる想定（requirements.md の規模の試算）なので、**全件は返さない。**
 * 検索・権限での絞り込み・ページングで、1 回に返すのは perPage 件まで。
 *
 * 削除は論理削除（active を false にするだけ）で行は DB に残るが、**既定では一覧に出さない。**
 * 消したはずの人が並び続けると一覧が使いものにならないため。
 * 誤って消したときに戻せるよう、includeDeleted を立てたときだけ一緒に返す。
 */
export async function listUsers(options: UserListOptions = {}): Promise<UserListResult> {
  const me = await requireRole(["admin"]);
  const perPage = 20;

  const keyword = options.q?.trim() ?? "";
  const where: Prisma.UserWhereInput = {
    ...(options.includeDeleted ? {} : { active: true }),
    ...(isRole(options.role ?? "") ? { role: options.role } : {}),
    // SQLite の contains は ASCII について大文字小文字を区別しない（メールは小文字で保存している）
    ...(keyword
      ? { OR: [{ name: { contains: keyword } }, { email: { contains: keyword } }] }
      : {}),
  };

  const total = await prisma.user.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);

  const [users, activeAdmins] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    // 「管理者が 0 人になる削除」を止めるための数。一覧の絞り込みとは切り離して DB 全体で数える
    prisma.user.count({ where: { role: "admin", active: true } }),
  ]);

  // 利用回数は 1 クエリでまとめて数える。1 人ずつ数えると 20 人で 20 回問い合わせることになる
  const counts = await prisma.reservation.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((u) => u.id) }, status: "booked" },
    _count: { _all: true },
  });
  const usage = new Map(counts.map((c) => [c.userId, c._count._all]));

  return {
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      gender: u.gender as Gender,
      usageCount: usage.get(u.id) ?? 0,
      // 実際の可否は deleteUserAccount でも確かめる。ここはボタンを出すかどうかの判断
      canDelete: u.id !== me.id && !(u.role === "admin" && u.active && activeAdmins <= 1),
    })),
    total,
    page,
    pageCount,
    perPage,
  };
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
  return { error: null, message: `${result.name} を有効に戻しました` };
}
