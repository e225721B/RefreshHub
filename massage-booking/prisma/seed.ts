// シードデータ（初期投入データ）。
// 人名はすべて仮名。実在の社員名・メールアドレス・社員番号は入れない。
//
// アカウントは自己登録が無く管理者が登録する設計（D-1）なので、
// 最初の管理者アカウントだけはここで用意する。
// パスワードは PoC のダミーアカウント専用の共通パスワード（本番はこの方式を採用しない）。
//
// 集計画面（/admin/stats）を確認するため、**過去 90 日ぶんの予約実績**も作る。
// 予約は昨日までしか作らない（今日以降を埋めると、予約画面の空き枠が塞がってしまうため）。

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { DEFAULT_WORK_WINDOWS, timeOfDay } from "../lib/business-hours";
import { toDateString } from "../lib/dates";
import { CLEANUP_MIN, STEP_MIN, toMinutes } from "../lib/slots";

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
const THERAPISTS = [
  { id: "t1", userId: "u-t1" },
  { id: "t2", userId: "u-t2" },
  { id: "t3", userId: "u-t3" },
  { id: "t4", userId: "u-t4" },
];

// 動作確認用の利用者。
// u1〜u3 は既存のテスト（lib/*.test.ts）が ID とメールアドレスを直接使っているので変えない。
// 集計画面で「ユニーク利用者数」「利用者別の一覧」が意味を持つよう、人数を増やしてある。
const REGULAR_USERS = [
  { id: "u1", name: "利用者 一郎", email: "user1@example.com", gender: "male" },
  { id: "u2", name: "利用者 二郎", email: "user2@example.com", gender: "male" },
  { id: "u3", name: "利用者 三郎", email: "user3@example.com", gender: "female" },
  { id: "u4", name: "利用者 四郎", email: "user4@example.com", gender: "male" },
  { id: "u5", name: "利用者 五月", email: "user5@example.com", gender: "female" },
  { id: "u6", name: "利用者 六実", email: "user6@example.com", gender: "female" },
  { id: "u7", name: "利用者 七海", email: "user7@example.com", gender: "female" },
  { id: "u8", name: "利用者 八郎", email: "user8@example.com", gender: "male" },
  { id: "u9", name: "利用者 九美", email: "user9@example.com", gender: "female" },
  { id: "u10", name: "利用者 十郎", email: "user10@example.com", gender: "male" },
];

// 要件では扉 1 つ・ベッド 3 台。R-1（午前は施術者 4 名だがベッド 3 台）は未確認のため、
// 台数はここを増やすだけで変えられるようにしている。
const BEDS = [
  { id: "b1", name: "ベッド A" },
  { id: "b2", name: "ベッド B" },
  { id: "b3", name: "ベッド C" },
];

// --- サンプル予約の設定 -----------------------------------------------------

/** 何日前ぶんまで予約実績を作るか */
const HISTORY_DAYS = 90;

/** 1 日あたりの予約件数の範囲 */
const PER_DAY_MIN = 2;
const PER_DAY_MAX = 9;

/** 動作確認のため「午前のみ」（月〜金 9:00〜14:00）で登録するセラピスト */
const AM_ONLY_THERAPIST_ID = "t2";
const AM_ONLY_WINDOW = { startTime: "09:00", endTime: "14:00" };

const TREATMENT_OPTIONS = [15, 30, 45];

/**
 * 乱数。**毎回同じ結果になる**ようにする。
 * 実行するたびに数字が変わると、集計画面で見えている値が正しいのか確かめられない。
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // 線形合同法。統計的な質は問わない（見た目がばらけていればよい）
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const random = makeRandom(20260910);
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
const randomInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

/** そのセラピストがその日に働ける時間帯 */
function windowsFor(therapistId: string) {
  return therapistId === AM_ONLY_THERAPIST_ID ? [AM_ONLY_WINDOW] : DEFAULT_WORK_WINDOWS;
}

/** その時間帯に収まる、施術開始時刻の候補（分） */
function startCandidates(therapistId: string, treatmentMin: number): number[] {
  const blockMin = treatmentMin + CLEANUP_MIN;
  const candidates: number[] = [];
  for (const w of windowsFor(therapistId)) {
    const start = toMinutes(w.startTime);
    const end = toMinutes(w.endTime);
    for (let t = start; t + blockMin <= end; t += STEP_MIN) candidates.push(t);
  }
  return candidates;
}

type PlannedReservation = {
  userId: string;
  therapistId: string;
  bedId: string;
  startAt: Date;
  endAt: Date;
  treatmentMin: number;
  status: string;
  cancelledById: string | null;
  cancelReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
};

/**
 * 過去 90 日ぶん（平日のみ・昨日まで）の予約を組み立てる。
 * ベッド・セラピスト・利用者が同じ時間に重ならないよう、15 分刻みで埋まりを見ながら置く。
 */
function planReservations(): PlannedReservation[] {
  const planned: PlannedReservation[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // よく使う人・たまに使う人の差を作る（利用者別の一覧に意味を持たせるため）
  const userPool = REGULAR_USERS.flatMap((u, i) =>
    Array.from({ length: i < 3 ? 4 : i < 6 ? 2 : 1 }, () => u.id),
  );

  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
    const day = new Date(today);
    day.setDate(day.getDate() - daysAgo);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue; // 土日は稼働しない

    // 「その日の 15 分枠が誰／どのベッドで埋まっているか」の目印
    const taken = new Set<string>();
    const target = randomInt(PER_DAY_MIN, PER_DAY_MAX);
    let placed = 0;

    for (let attempt = 0; attempt < target * 6 && placed < target; attempt++) {
      const userId = pick(userPool);
      const therapistId = pick(THERAPISTS).id;
      const bedId = pick(BEDS).id;
      const treatmentMin = pick(TREATMENT_OPTIONS);

      const candidates = startCandidates(therapistId, treatmentMin);
      const startMin = pick(candidates);
      const blockMin = treatmentMin + CLEANUP_MIN;

      // 押さえる 15 分枠すべてが空いているか（ベッド・セラピスト・利用者のどれも重ねない）
      const keys: string[] = [];
      for (let t = startMin; t < startMin + blockMin; t += STEP_MIN) {
        keys.push(`bed:${bedId}@${t}`, `th:${therapistId}@${t}`, `user:${userId}@${t}`);
      }
      if (keys.some((k) => taken.has(k))) continue;
      for (const k of keys) taken.add(k);

      const startAt = new Date(day);
      startAt.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
      const endAt = new Date(startAt);
      endAt.setMinutes(endAt.getMinutes() + blockMin);

      // 予約したのは施術の 0〜5 日前という想定
      const createdAt = new Date(startAt);
      createdAt.setDate(createdAt.getDate() - randomInt(0, 5));

      // 1 割ほどはキャンセル。利用者都合と運営都合（管理者が取り消した分）を混ぜる
      const roll = random();
      const cancelledByUser = roll < 0.08;
      const cancelledByAdmin = !cancelledByUser && roll < 0.12;
      const cancelledAt = new Date(startAt);
      cancelledAt.setHours(cancelledAt.getHours() - 3);

      planned.push({
        userId,
        therapistId,
        bedId,
        startAt,
        endAt,
        treatmentMin,
        status: cancelledByUser || cancelledByAdmin ? "cancelled" : "booked",
        cancelledById: cancelledByUser ? userId : cancelledByAdmin ? ADMIN.id : null,
        cancelReason: cancelledByUser
          ? "急な会議が入ったため"
          : cancelledByAdmin
            ? "担当者の欠勤のため"
            : null,
        cancelledAt: cancelledByUser || cancelledByAdmin ? cancelledAt : null,
        createdAt,
      });
      placed++;
    }
  }

  return planned;
}

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
  await prisma.therapistWorkHours.createMany({
    data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      therapistId: AM_ONLY_THERAPIST_ID,
      dayOfWeek,
      startAt: timeOfDay(AM_ONLY_WINDOW.startTime),
      endAt: timeOfDay(AM_ONLY_WINDOW.endTime),
    })),
  });

  // 集計画面（/admin/stats）の確認用。今日以降は作らないので、予約画面の空き枠には影響しない
  const reservations = planReservations();
  await prisma.reservation.createMany({ data: reservations });

  const booked = reservations.filter((r) => r.status === "booked");
  const uniqueUsers = new Set(booked.map((r) => r.userId)).size;
  const oldest = reservations[0] ? toDateString(reservations[0].startAt) : "-";
  const newest = reservations.at(-1) ? toDateString(reservations.at(-1)!.startAt) : "-";

  console.log(
    `投入完了: 管理者 1 名 / マッサージ師 ${THERAPIST_USERS.length} 名 / 利用者 ${REGULAR_USERS.length} 名 / ベッド ${BEDS.length} 台`,
  );
  console.log(`全アカウント共通パスワード: ${SEED_PASSWORD}`);
  console.log(`セラピスト ${AM_ONLY_THERAPIST_ID} は月〜金 9:00〜14:00 の「午前のみ」で登録済み`);
  console.log(
    `サンプル予約 ${reservations.length} 件（${oldest}〜${newest}）: ` +
      `利用 ${booked.length} 件 / キャンセル ${reservations.length - booked.length} 件 / ` +
      `ユニーク利用者 ${uniqueUsers} 人`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
