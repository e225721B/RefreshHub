// A-5 の確認: 管理者が登録したアカウントが DB に入り、そのアカウントでログインできること。
// 実際の dev.db に対して実行し、作ったユーザーはテストの最後に消す。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { generatePassword } from "./generate-password";
import { verifyPassword } from "./password";
import { type CookieJar, login } from "./session";
import { createUserAccount, deleteUserAccount, reactivateUserAccount } from "./users";

/** このテストで作ったユーザーだけを消すための目印 */
const SUFFIX = `+test-${Date.now()}@example.com`;
const emailFor = (local: string) => `${local}${SUFFIX}`;

function memoryJar(): CookieJar {
  const store = new Map<string, string>();
  return {
    get: (name) => store.get(name),
    set: (name, value) => store.set(name, value),
    delete: (name) => store.delete(name),
  };
}

after(async () => {
  const created = await prisma.user.findMany({ where: { email: { endsWith: SUFFIX } } });
  const ids = created.map((u) => u.id);
  const therapists = await prisma.therapist.findMany({ where: { userId: { in: ids } } });
  const therapistIds = therapists.map((t) => t.id);

  // 依存関係の逆順に消す（テストで作った予約が残っていると User を消せない）
  await prisma.notification.deleteMany({ where: { toUserId: { in: ids } } });
  await prisma.reservation.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { therapistId: { in: therapistIds } }] },
  });
  await prisma.therapistWorkHours.deleteMany({ where: { therapistId: { in: therapistIds } } });
  await prisma.therapist.deleteMany({ where: { id: { in: therapistIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

/** 削除のテスト用に、その人の予約を 1 件だけ作る（シードのベッド・施術者を借りる） */
async function createReservationFor(userId: string) {
  const bed = await prisma.bed.findFirstOrThrow();
  const therapist = await prisma.therapist.findFirstOrThrow();
  const startAt = new Date("2030-01-07T09:00:00");
  const endAt = new Date("2030-01-07T10:00:00");
  return prisma.reservation.create({
    data: { userId, bedId: bed.id, therapistId: therapist.id, startAt, endAt, treatmentMin: 45 },
  });
}

test("利用者を登録すると、そのアカウントでログインできる", async () => {
  const email = emailFor("newuser");
  const password = generatePassword();

  const result = await createUserAccount({ name: "追加 太郎", email, role: "user", password });
  assert.equal(result.ok, true);

  const jar = memoryJar();
  const loggedIn = await login(jar, email, password);
  assert.equal(loggedIn.ok, true);
});

test("パスワードは平文で保存されない", async () => {
  const email = emailFor("hashed");
  const password = generatePassword();
  await createUserAccount({ name: "追加 花子", email, role: "user", password });

  const saved = await prisma.user.findUnique({ where: { email } });
  assert.ok(saved);
  assert.notEqual(saved.password, password, "平文がそのまま入っている");
  assert.ok(verifyPassword(password, saved.password), "ハッシュから照合できること");
});

test("マッサージ師を登録すると Therapist も同時に作られる", async () => {
  const email = emailFor("newtherapist");
  const result = await createUserAccount({
    name: "施術者 Z",
    email,
    role: "therapist",
    gender: "female",
    password: generatePassword(),
  });
  assert.equal(result.ok, true);

  const saved = await prisma.user.findUnique({ where: { email }, include: { therapist: true } });
  assert.equal(saved?.role, "therapist");
  assert.equal(saved?.therapist?.gender, "female");
  assert.equal(saved?.therapist?.active, true);
});

test("性別を選ばずにマッサージ師を登録するとエラーになり、User も作られない", async () => {
  const email = emailFor("nogender");
  const result = await createUserAccount({
    name: "施術者 Y",
    email,
    role: "therapist",
    password: generatePassword(),
  });
  assert.equal(result.ok, false);
  assert.equal(await prisma.user.findUnique({ where: { email } }), null);
});

test("同じメールアドレスは 2 回登録できない", async () => {
  const email = emailFor("duplicate");
  const first = await createUserAccount({
    name: "重複 一郎",
    email,
    role: "user",
    password: generatePassword(),
  });
  assert.equal(first.ok, true);

  const second = await createUserAccount({
    name: "重複 二郎",
    email,
    role: "user",
    password: generatePassword(),
  });
  assert.equal(second.ok, false);
  assert.match(second.ok ? "" : second.message, /すでに登録されています/);
});

test("メールアドレスは大文字で入力しても小文字で保存され、小文字でログインできる", async () => {
  const email = emailFor("MixedCase");
  const password = generatePassword();
  await createUserAccount({ name: "大文字 三郎", email, role: "user", password });

  const jar = memoryJar();
  const loggedIn = await login(jar, email.toLowerCase(), password);
  assert.equal(loggedIn.ok, true);
});

test("弱いパスワード・不正なメールアドレス・不明な権限は弾く", async () => {
  const weak = await createUserAccount({
    name: "弱い 四郎",
    email: emailFor("weak"),
    role: "user",
    password: "abc",
  });
  assert.equal(weak.ok, false);

  const badEmail = await createUserAccount({
    name: "不正 五郎",
    email: "not-an-email",
    role: "user",
    password: generatePassword(),
  });
  assert.equal(badEmail.ok, false);

  const badRole = await createUserAccount({
    name: "不明 六郎",
    email: emailFor("badrole"),
    role: "superuser",
    password: generatePassword(),
  });
  assert.equal(badRole.ok, false);
});

test("予約が無いユーザーは DB から完全に削除される", async () => {
  const email = emailFor("deletable");
  const created = await createUserAccount({
    name: "削除 太郎",
    email,
    role: "user",
    password: generatePassword(),
  });
  assert.equal(created.ok, true);

  const result = await deleteUserAccount("u-admin", created.ok ? created.user.id : "");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.mode, "deleted");
  assert.equal(await prisma.user.findUnique({ where: { email } }), null);
});

test("マッサージ師を削除すると Therapist の行も一緒に消える", async () => {
  const email = emailFor("deletable-therapist");
  const created = await createUserAccount({
    name: "削除 施術者",
    email,
    role: "therapist",
    gender: "male",
    password: generatePassword(),
  });
  assert.ok(created.ok);
  const therapist = await prisma.therapist.findUnique({ where: { userId: created.user.id } });
  assert.ok(therapist, "登録時に Therapist が作られていること");

  const result = await deleteUserAccount("u-admin", created.user.id);
  assert.equal(result.ok && result.mode, "deleted");
  assert.equal(await prisma.therapist.findUnique({ where: { id: therapist.id } }), null);
});

test("予約があるユーザーは削除されず無効になり、ログインできなくなる", async () => {
  const email = emailFor("hashistory");
  const password = generatePassword();
  const created = await createUserAccount({ name: "実績 花子", email, role: "user", password });
  assert.ok(created.ok);
  await createReservationFor(created.user.id);

  const result = await deleteUserAccount("u-admin", created.user.id);
  assert.equal(result.ok && result.mode, "deactivated");

  const stillThere = await prisma.user.findUnique({ where: { email } });
  assert.ok(stillThere, "アカウントは残っていること（過去の予約が壊れないため）");
  assert.equal(stillThere?.active, false);

  const jar = memoryJar();
  const loggedIn = await login(jar, email, password);
  assert.equal(loggedIn.ok, false, "無効なアカウントではログインできないこと");

  // 有効に戻せば、またログインできる
  await reactivateUserAccount(created.user.id);
  const again = await login(memoryJar(), email, password);
  assert.equal(again.ok, true);
});

test("自分自身は削除できない", async () => {
  const result = await deleteUserAccount("u-admin", "u-admin");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /自分自身/);
});

test("最後の管理者は削除できない", async () => {
  const admins = await prisma.user.count({ where: { role: "admin", active: true } });
  assert.equal(admins, 1, "シードの管理者が 1 人だけであること（前提）");

  // 別の管理者から消そうとしても、管理者が 0 人になる操作は通らない
  const other = await createUserAccount({
    name: "別の管理者",
    email: emailFor("admin2"),
    role: "admin",
    password: generatePassword(),
  });
  assert.ok(other.ok);

  // ここで管理者は 2 人。片方は消せる
  const ok = await deleteUserAccount("u-admin", other.user.id);
  assert.equal(ok.ok, true);

  // 残り 1 人になった状態で、その 1 人を消そうとすると拒否される
  const again = await createUserAccount({
    name: "別の管理者 2",
    email: emailFor("admin3"),
    role: "admin",
    password: generatePassword(),
  });
  assert.ok(again.ok);
  await prisma.user.update({ where: { id: again.user.id }, data: { active: false } });

  const refused = await deleteUserAccount(again.user.id, "u-admin");
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? "" : refused.message, /管理者が 0 人/);
});
