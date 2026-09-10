// A-5 の確認: 管理者が登録したアカウントが DB に入り、そのアカウントでログインできること。
// 実際の dev.db に対して実行し、作ったユーザーはテストの最後に消す。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { generatePassword } from "./generate-password";
import { verifyPassword } from "./password";
import { type CookieJar, login } from "./session";
import { isValidPassword } from "./generate-password";
import { createUserAccount, deleteUserAccount, reactivateUserAccount } from "./users";
import { fetchWeekAvailability } from "@/app/actions/booking";

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

  const result = await createUserAccount({ name: "追加 太郎", email, gender: "female", role: "user", password });
  assert.equal(result.ok, true);

  const jar = memoryJar();
  const loggedIn = await login(jar, email, password);
  assert.equal(loggedIn.ok, true);
});

test("パスワードは平文で保存されない", async () => {
  const email = emailFor("hashed");
  const password = generatePassword();
  await createUserAccount({ name: "追加 花子", email, gender: "female", role: "user", password });

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
  // 性別は User が持つ（Therapist ではない）
  assert.equal(saved?.gender, "female");
  assert.ok(saved?.therapist, "Therapist の行も作られていること");
  assert.equal(saved?.therapist?.active, true);
});

test("利用者・管理者にも性別が保存される", async () => {
  const withGender = await createUserAccount({
    name: "性別あり 一郎",
    email: emailFor("user-with-gender"),
    role: "user",
    gender: "male",
  });
  assert.ok(withGender.ok);
  assert.equal((await prisma.user.findUnique({ where: { id: withGender.user.id } }))?.gender, "male");

  const admin = await createUserAccount({
    name: "性別あり 管理者",
    email: emailFor("admin-with-gender"),
    role: "admin",
    gender: "female",
  });
  assert.ok(admin.ok);
  assert.equal((await prisma.user.findUnique({ where: { id: admin.user.id } }))?.gender, "female");
});

test("性別に知らない値を渡すと弾く", async () => {
  const result = await createUserAccount({
    name: "変な値 三郎",
    email: emailFor("bad-gender"),
    role: "user",
    gender: "unknown",
  });
  assert.equal(result.ok, false);
});

test("性別を選ばないとどの権限でもエラーになり、User も作られない", async () => {
  for (const role of ["user", "admin", "therapist"]) {
    const email = emailFor(`nogender-${role}`);
    const result = await createUserAccount({
      name: "性別なし Y",
      email,
      role,
      gender: "",
      password: generatePassword(),
    });
    assert.equal(result.ok, false, `${role} は性別なしで登録できないこと`);
    assert.match(result.ok ? "" : result.message, /性別/);
    assert.equal(await prisma.user.findUnique({ where: { email } }), null);
  }
});

test("同じメールアドレスは 2 回登録できない", async () => {
  const email = emailFor("duplicate");
  const first = await createUserAccount({
    name: "重複 一郎",
    email,
    gender: "female",
    role: "user",
    password: generatePassword(),
  });
  assert.equal(first.ok, true);

  const second = await createUserAccount({
    name: "重複 二郎",
    email,
    gender: "female",
    role: "user",
    password: generatePassword(),
  });
  assert.equal(second.ok, false);
  assert.match(second.ok ? "" : second.message, /すでに登録されています/);
});

test("メールアドレスは大文字で入力しても小文字で保存され、小文字でログインできる", async () => {
  const email = emailFor("MixedCase");
  const password = generatePassword();
  await createUserAccount({ name: "大文字 三郎", email, gender: "female", role: "user", password });

  const jar = memoryJar();
  const loggedIn = await login(jar, email.toLowerCase(), password);
  assert.equal(loggedIn.ok, true);
});

test("弱いパスワード・不正なメールアドレス・不明な権限は弾く", async () => {
  const weak = await createUserAccount({
    name: "弱い 四郎",
    email: emailFor("weak"),
    gender: "female",
    role: "user",
    password: "abc",
  });
  assert.equal(weak.ok, false);

  const badEmail = await createUserAccount({
    name: "不正 五郎",
    email: "not-an-email",
    gender: "female",
    role: "user",
    password: generatePassword(),
  });
  assert.equal(badEmail.ok, false);

  const badRole = await createUserAccount({
    name: "不明 六郎",
    email: emailFor("badrole"),
    gender: "female",
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
    gender: "female",
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
  const created = await createUserAccount({ name: "実績 花子", email, gender: "female",
    role: "user", password });
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

/** その週の空き枠に出てくるマッサージ師の一覧。担当候補に出るかどうかを見るために使う */
async function therapistIdsInWeek(monday: string): Promise<Set<string>> {
  const week = await fetchWeekAvailability(monday, ["female", "male"]);
  const ids = new Set<string>();
  for (const byTreatment of Object.values(week)) {
    for (const byTime of Object.values(byTreatment)) {
      for (const slot of Object.values(byTime)) ids.add(slot.therapistId);
    }
  }
  return ids;
}

test("記録があるマッサージ師を無効化すると、空き枠の担当に出なくなる", async () => {
  const created = await createUserAccount({
    name: "無効化 施術者",
    email: emailFor("deactivated-therapist"),
    role: "therapist",
    gender: "female",
  });
  assert.ok(created.ok);
  const therapist = await prisma.therapist.findUniqueOrThrow({
    where: { userId: created.user.id },
  });

  // 空き枠は 1 時刻につき 1 人しか出ないため、他のマッサージ師を一時的に受付停止にして
  // 「この人が出るかどうか」だけを見られるようにする
  const others = await prisma.therapist.findMany({
    where: { active: true, NOT: { id: therapist.id } },
  });
  const otherIds = others.map((t) => t.id);
  await prisma.therapist.updateMany({ where: { id: { in: otherIds } }, data: { active: false } });

  try {
    const MONDAY = "2030-01-07";
    assert.ok(
      (await therapistIdsInWeek(MONDAY)).has(therapist.id),
      "無効化する前は担当候補に出ていること",
    );

    // 記録を作り、削除ではなく無効化に倒す
    await createReservationFor(created.user.id);
    const result = await deleteUserAccount("u-admin", created.user.id);
    assert.equal(result.ok && result.mode, "deactivated");

    assert.equal(
      (await therapistIdsInWeek(MONDAY)).has(therapist.id),
      false,
      "ログインできないアカウントが担当候補に残っていないこと",
    );
    // Therapist.active は勤務側の設定なので、アカウントの無効化では触らない
    const after = await prisma.therapist.findUniqueOrThrow({ where: { id: therapist.id } });
    assert.equal(after.active, true);
  } finally {
    await prisma.therapist.updateMany({ where: { id: { in: otherIds } }, data: { active: true } });
  }
});

test("自分自身は削除できない", async () => {
  const result = await deleteUserAccount("u-admin", "u-admin");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /自分自身/);
});

test("有効な管理者が 1 人だけのとき、その管理者は削除できない", async () => {
  // 他のテストが作った管理者の数に左右されないよう、u-admin 以外を一時的に無効にする
  const others = await prisma.user.findMany({
    where: { role: "admin", active: true, NOT: { id: "u-admin" } },
  });
  const otherIds = others.map((o) => o.id);
  await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { active: false } });

  try {
    const refused = await deleteUserAccount("u1", "u-admin");
    assert.equal(refused.ok, false);
    assert.match(refused.ok ? "" : refused.message, /管理者が 0 人/);
  } finally {
    await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { active: true } });
  }
});

test("管理者が 2 人以上いれば、片方は削除できる", async () => {
  const extra = await createUserAccount({
    name: "別の管理者",
    email: emailFor("admin-extra"),
    gender: "female",
    role: "admin",
  });
  assert.ok(extra.ok);

  const result = await deleteUserAccount("u-admin", extra.user.id);
  assert.equal(result.ok, true);
  assert.equal(await prisma.user.findUnique({ where: { id: extra.user.id } }), null);
});
test("パスワードを渡さなければサーバ側で自動的に作られ、その値でログインできる", async () => {
  const email = emailFor("autopass");
  // 画面（モーダル）からはパスワードを送らない。この呼び方が本番と同じ
  const result = await createUserAccount({ name: "自動 太郎", email, gender: "female",
    role: "user" });
  assert.ok(result.ok);
  assert.ok(isValidPassword(result.password), `生成された値が条件を満たすこと: ${result.password}`);

  const jar = memoryJar();
  const loggedIn = await login(jar, email, result.password);
  assert.equal(loggedIn.ok, true);

  // 保存されているのはハッシュだけ
  const saved = await prisma.user.findUnique({ where: { email } });
  assert.notEqual(saved?.password, result.password);
});

test("自動で作られるパスワードは登録ごとに違う", async () => {
  const a = await createUserAccount({ name: "自動 A", email: emailFor("auto-a"), gender: "female",
    role: "user" });
  const b = await createUserAccount({ name: "自動 B", email: emailFor("auto-b"), gender: "female",
    role: "user" });
  assert.ok(a.ok && b.ok);
  assert.notEqual(a.password, b.password);
});
