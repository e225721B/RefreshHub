// シードデータ（初期投入データ）。
// 人名はすべて仮名。実在の社員名・メールアドレス・社員番号は入れない。
//
// アカウントは自己登録が無く管理者が登録する設計（D-1）なので、
// 最初の管理者アカウントだけはここで用意する。
// パスワードは PoC のダミーアカウント専用の共通パスワード（本番はこの方式を採用しない）。

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { timeOfDay } from "../lib/business-hours";

const prisma = new PrismaClient();

const SEED_PASSWORD = "password1234"; // pragma: allowlist secret

// 性別は User が持ち、権限に関わらず必須。ここも仮名のサンプル値
const ADMIN = { id: "u-admin", name: "管理者", email: "admin@example.com", gender: "female" };

// 要件 Q-3 に合わせる: 午前は女性 1 名 + 男性 3 名、午後は男性 3 名（既定パターンで表現する）
// 性別は User が持つ（利用者・管理者も必須）。Therapist は勤務のことだけを持つ
const THERAPIST_USERS = [
  { id: "u-t1", name: "施術者 A", email: "therapist-a@example.com", gender: "female" },
  { id: "u-t2", name: "施術者 B", email: "therapist-b@example.com", gender: "male" },
  { id: "u-t3", name: "施術者 C", email: "therapist-c@example.com", gender: "male" },
  { id: "u-t4", name: "施術者 D", email: "therapist-d@example.com", gender: "male" },
];
// bio / tags はマッサージ師紹介画面（画面 3）用の紹介文。仮の内容
const THERAPISTS = [
  {
    id: "t1",
    userId: "u-t1",
    experienceYears: 12,
    bio: "デスクワークで固まった肩甲骨まわりが得意です。強さは会話しながら合わせるので、初めてでも遠慮なく言ってください。15 分でも首から肩までしっかりほぐします。",
    tags: "肩・首,やさしめ,初めての方に",
  },
  {
    id: "t2",
    userId: "u-t2",
    experienceYears: 8,
    bio: "腰まわりと脚のむくみが専門。しっかりめの圧が好きな方に選ばれています。長時間座りっぱなしの日は、30 分で腰から下を通してほぐすのがおすすめです。",
    tags: "腰・脚,しっかりめ,むくみ",
  },
  {
    id: "t3",
    userId: "u-t3",
    experienceYears: 15,
    bio: "頭と目の疲れをとる施術が得意。画面を見続けた日の 15 分に向いています。終わったあと視界が明るくなった、という声をよくもらいます。",
    tags: "頭・眼精疲労,15 分向き,静かめ",
  },
  {
    id: "t4",
    userId: "u-t4",
    experienceYears: 6,
    bio: "ストレッチを組み合わせた施術で、可動域を広げるのが得意です。運動不足が気になる方、身体を動かしたあとのケアをしたい方に。",
    tags: "ストレッチ,全身,45 分向き",
  },
];

// 動作確認用の利用者
const REGULAR_USERS = [
  { id: "u1", name: "利用者 一郎", email: "user1@example.com", gender: "male" },
  { id: "u2", name: "利用者 二郎", email: "user2@example.com", gender: "male" },
  { id: "u3", name: "利用者 三郎", email: "user3@example.com", gender: "female" },
];

// 要件では扉 1 つ・ベッド 3 台。R-1（午前は施術者 4 名だがベッド 3 台）は未確認のため、
// 台数はここを増やすだけで変えられるようにしている。
const BEDS = [
  { id: "b1", name: "ベッド A" },
  { id: "b2", name: "ベッド B" },
  { id: "b3", name: "ベッド C" },
];

async function main() {
  // 依存関係の逆順に消す
  await prisma.notification.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.therapistAbsence.deleteMany();
  await prisma.therapistWorkHours.deleteMany();
  await prisma.therapist.deleteMany();
  await prisma.bed.deleteMany();
  await prisma.user.deleteMany();

  const password = hashPassword(SEED_PASSWORD);

  await prisma.user.create({ data: { ...ADMIN, password, role: "admin" } });
  await prisma.user.createMany({
    data: THERAPIST_USERS.map((u) => ({ ...u, password, role: "therapist" })),
  });
  await prisma.user.createMany({
    data: REGULAR_USERS.map((u) => ({ ...u, password, role: "user" })),
  });

  await prisma.therapist.createMany({ data: THERAPISTS });
  await prisma.bed.createMany({ data: BEDS });

  // 動作確認のため 1 名だけ「午前のみ」（月〜金 9:00〜14:00）を既定と違う勤務時間として登録する。
  // 行が無い他の施術者は lib/business-hours.ts の既定（9:00〜14:00・15:00〜20:00）がそのまま使われる。
  const AM_ONLY_THERAPIST_ID = "t2";
  await prisma.therapistWorkHours.createMany({
    data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      therapistId: AM_ONLY_THERAPIST_ID,
      dayOfWeek,
      startAt: timeOfDay("09:00"),
      endAt: timeOfDay("14:00"),
    })),
  });

  console.log(
    `投入完了: 管理者 1 名 / マッサージ師 ${THERAPIST_USERS.length} 名 / 利用者 ${REGULAR_USERS.length} 名 / ベッド ${BEDS.length} 台`,
  );
  console.log(`全アカウント共通パスワード: ${SEED_PASSWORD}`);
  console.log(`セラピスト ${AM_ONLY_THERAPIST_ID} は月〜金 9:00〜14:00 の「午前のみ」で登録済み`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
