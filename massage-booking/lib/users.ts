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
   * 性別。**どの権限でも必須**（User が持つ）。
   * マッサージ師の場合は、利用者が「担当の性別」で空き枠を絞り込むのにも使う。
   */
  gender: string;
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
  const gender = input.gender.trim();
  // 渡されなければサーバ側で作る。管理者が考える必要も、画面に平文を置く必要も無くなる
  const password = input.password ?? generatePassword();

  if (!name) return fail("氏名を入力してください");
  if (!email) return fail("メールアドレスを入力してください");
  if (!isValidEmail(email)) return fail("メールアドレスの形式が正しくありません");
  if (!isRole(role)) return fail("権限を選んでください");
  // 性別はどの権限でも必須。空のまま登録できると、あとから埋め直す手間が残る
  if (gender === "") return fail("性別を選んでください");
  if (!isGender(gender)) return fail("性別の値が正しくありません");
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
          gender,
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
 * そのユーザーが残している記録の件数を数える。
 * 削除の可否を決めるためではなく、**一覧に「利用実績」として見せる**ために使う
 * （削除は記録の有無によらず論理削除に統一した。design.md の「ユーザーの削除は論理削除」を参照）。
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
  | { ok: true; name: string }
  | { ok: false; message: string };

/**
 * ユーザーを削除する（AC-17）。**論理削除。DB の行は消さない。**
 *
 * `User.active` を false にすることが、このアプリでの「削除」。
 * ログインできなくなり、空き枠の担当にも出なくなるが、行は残る。
 *
 * 物理削除にしない理由: 予約・担当・通知・キャンセル操作はすべて User を指しており、
 * **消すと過去の予約と集計（AC-6 / AC-7）が壊れ、「誰が使ったか」が後から追えなくなる。**
 * 記録が 1 件も無い人（登録の打ち間違い）だけ物理削除する作りにしていたが、
 * 「後から見返せること」を優先してレビューで論理削除に統一した（2026-09-10）。
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

  if (!user.active) return fail(`${user.name} はすでに削除されています`);

  // 倒すのは User.active だけ。Therapist.active は「今この人の予約を受け付けるか」という
  // 勤務側の別の設定なので、アカウントの有効・無効で勝手に書き換えない。
  // 削除した人が空き枠の担当に出ないことは、空き枠側で user.active も見て担保している
  // （app/actions/booking.ts の fetchWeekAvailability）。同じ状態を 2 か所に持つと必ずずれるため。
  await prisma.user.update({ where: { id: userId }, data: { active: false } });
  return { ok: true, name: user.name };
}

/**
 * 削除したユーザーを元に戻す。論理削除なので行が残っており、戻せる。
 * 戻すのも User.active だけ。マッサージ師の Therapist.active は削除のときに触っていないので、
 * 「休止中にしていた人が復帰で勝手に受付中に戻る」ことは起きない。
 */
export async function reactivateUserAccount(userId: string): Promise<DeleteUserResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, message: "対象のユーザーが見つかりません" };
  await prisma.user.update({ where: { id: userId }, data: { active: true } });
  return { ok: true, name: user.name };
}
