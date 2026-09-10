// アカウント登録の中身（AC-17）。
// Server Action（app/actions/users.ts）から権限チェックとフォームの読み取りを分け、
// 「検証して DB に入れる」部分だけをここに置く。next/headers に依存しないため、
// lib/users.test.ts から直接呼んで確かめられる。

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generatePassword, isValidPassword, PASSWORD_MIN_LENGTH } from "@/lib/generate-password";
import { hashPassword } from "@/lib/password";
import { isGender, isRole, type Role } from "@/lib/roles";

export type CreateUserInput = {
  name: string;
  email: string;
  role: string;
  /**
   * 性別。**どの権限でも選べる**（User が持つ）。
   * マッサージ師だけは必須。利用者が「担当の性別」で空き枠を絞り込むのに使うため。
   */
  gender?: string;
  /**
   * 初期パスワード。**画面からは渡さない。**
   * 省略するとここで自動生成する（管理者に決めさせず、弱いパスワードが生まれないようにするため）。
   * テストで「決まった値でログインできるか」を確かめたいときだけ渡す。
   */
  password?: string;
};

export type CreateUserResult =
  | {
      ok: true;
      user: { id: string; name: string; email: string; role: Role };
      /** 本人に渡すための平文。保存されるのはハッシュだけなので、ここでしか受け取れない */
      password: string;
    }
  | { ok: false; message: string };

/** 表記ゆれとログインできない事故を防ぐため、メールアドレスは小文字に揃えて保存する */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * アカウントを 1 件登録する。
 * 権限が「マッサージ師」のときは User と Therapist を 1 つのトランザクションで作る。
 * 片方だけ作られると、ログインはできるのに予約の担当に出てこないユーザーが生まれるため。
 */
export async function createUserAccount(input: CreateUserInput): Promise<CreateUserResult> {
  const fail = (message: string): CreateUserResult => ({ ok: false, message });

  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const role = input.role;
  const gender = input.gender ?? "";
  // 渡されなければサーバ側で作る。管理者が考える必要も、画面に平文を置く必要も無くなる
  const password = input.password ?? generatePassword();

  if (!name) return fail("氏名を入力してください");
  if (!email) return fail("メールアドレスを入力してください");
  if (!isValidEmail(email)) return fail("メールアドレスの形式が正しくありません");
  if (!isRole(role)) return fail("権限を選んでください");
  if (role === "therapist" && !isGender(gender)) {
    return fail("マッサージ師は性別を選んでください（利用者が担当の性別で絞り込むため）");
  }
  // 利用者・管理者は性別を選ばなくてよい。選ぶなら値が正しいことだけ確かめる
  if (gender !== "" && !isGender(gender)) {
    return fail("性別の値が正しくありません");
  }
  if (!isValidPassword(password)) {
    return fail(`初期パスワードは ${PASSWORD_MIN_LENGTH} 文字以上で、英字と数字を含めてください`);
  }

  // 先に重複を見て分かりやすいメッセージを返す（同時登録の取りこぼしは下の catch で拾う）
  if (await prisma.user.findUnique({ where: { email } })) {
    return fail(`${email} はすでに登録されています`);
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        // 平文は保存しない。保存するのは lib/password.ts のハッシュだけ
        data: {
          name,
          email,
          password: hashPassword(password),
          role,
          gender: isGender(gender) ? gender : null,
        },
      });
      if (role === "therapist") {
        // Therapist は勤務のことだけを持つ。性別は User 側にある
        await tx.therapist.create({ data: { userId: created.id } });
      }
      return created;
    });
    return { ok: true, user: { id: user.id, name: user.name, email: user.email, role }, password };
  } catch (e) {
    // P2002 = 一意制約違反。この処理では email の重複しかありえない
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail(`${email} はすでに登録されています`);
    }
    throw e;
  }
}

export type UserHistory = {
  /** 利用者としての予約 */
  reservations: number;
  /** マッサージ師としての担当予約 */
  assignments: number;
  /** 通知・キャンセル操作・登録した欠勤など、消すと辿れなくなる記録 */
  others: number;
};

export function hasHistory(h: UserHistory): boolean {
  return h.reservations + h.assignments + h.others > 0;
}

/**
 * そのユーザーを消すと壊れる記録の件数を数える。
 * 1 件でもあれば物理削除せず「無効化」に切り替える（design.md の active フラグの判断）。
 */
export async function countUserHistory(userId: string): Promise<UserHistory> {
  const therapist = await prisma.therapist.findUnique({ where: { userId } });
  const [reservations, assignments, notifications, cancellations, absencesCreated] =
    await Promise.all([
      prisma.reservation.count({ where: { userId } }),
      therapist ? prisma.reservation.count({ where: { therapistId: therapist.id } }) : 0,
      prisma.notification.count({ where: { toUserId: userId } }),
      prisma.reservation.count({ where: { cancelledById: userId } }),
      prisma.therapistAbsence.count({ where: { createdById: userId } }),
    ]);
  return { reservations, assignments, others: notifications + cancellations + absencesCreated };
}

export type DeleteUserResult =
  | { ok: true; mode: "deleted" | "deactivated"; name: string }
  | { ok: false; message: string };

/**
 * ユーザーを削除する（AC-17）。
 *
 * 予約などの記録が 1 件も無ければ DB から消す（登録の間違いをなかったことにできる）。
 * 記録がある場合は消さずに「無効化」してログインできなくする。
 * 消してしまうと過去の予約と集計（AC-6 / AC-7）が壊れ、「誰が使ったか」が追えなくなるため。
 */
export async function deleteUserAccount(
  actorId: string,
  userId: string,
): Promise<DeleteUserResult> {
  const fail = (message: string): DeleteUserResult => ({ ok: false, message });

  if (actorId === userId) {
    return fail("自分自身のアカウントは削除できません");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { therapist: true },
  });
  if (!user) return fail("対象のユーザーが見つかりません");

  // 管理者が 0 人になると、以降だれもユーザーを登録できなくなる
  if (user.role === "admin" && user.active) {
    const activeAdmins = await prisma.user.count({ where: { role: "admin", active: true } });
    if (activeAdmins <= 1) {
      return fail("管理者が 0 人になるため削除できません。先に別の管理者を登録してください");
    }
  }

  const history = await countUserHistory(userId);
  if (hasHistory(history)) {
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    return { ok: true, mode: "deactivated", name: user.name };
  }

  // 記録が無いので完全に消す。マッサージ師なら勤務ルールごと消す
  const therapist = user.therapist;
  await prisma.$transaction(async (tx) => {
    if (therapist) {
      await tx.therapistWorkHours.deleteMany({ where: { therapistId: therapist.id } });
      await tx.therapistAbsence.deleteMany({ where: { therapistId: therapist.id } });
      await tx.therapist.delete({ where: { id: therapist.id } });
    }
    await tx.user.delete({ where: { id: userId } });
  });
  return { ok: true, mode: "deleted", name: user.name };
}

/** 無効化したユーザーを元に戻す。削除が「無効化」に切り替わったときの戻し道 */
export async function reactivateUserAccount(userId: string): Promise<DeleteUserResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, message: "対象のユーザーが見つかりません" };
  await prisma.user.update({ where: { id: userId }, data: { active: true } });
  return { ok: true, mode: "deactivated", name: user.name };
}
