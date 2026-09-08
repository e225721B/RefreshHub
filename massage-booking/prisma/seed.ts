// シードデータ（初期投入データ）。
// AC-9（シフト登録画面）と AC-10（マスタ管理画面）は MVP から外したため、ここでデータを用意する。
// 人名はすべて仮名。実在の社員名・メールアドレス・社員番号は入れない。

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 要件 Q-3 に合わせる: 午前は女性 1 名 + 男性 3 名、午後は男性 3 名
const THERAPISTS = [
  { id: "t1", name: "施術者 A", gender: "female" },
  { id: "t2", name: "施術者 B", gender: "male" },
  { id: "t3", name: "施術者 C", gender: "male" },
  { id: "t4", name: "施術者 D", gender: "male" },
];

// 要件では扉 1 つ・ベッド 3 台。R-1（午前は施術者 4 名だがベッド 3 台）は未確認のため、
// 台数はここを増やすだけで変えられるようにしている。
const BEDS = [
  { id: "b1", name: "ベッド A" },
  { id: "b2", name: "ベッド B" },
  { id: "b3", name: "ベッド C" },
];

const MORNING = { startTime: "09:00", endTime: "14:00" };
const AFTERNOON = { startTime: "15:00", endTime: "19:00" };

/**
 * 今週の月曜日から数えて、指定した週数ぶんの平日を返す。
 * 画面は週表示（月〜金）なので、今週の頭からシフトが無いと表が空になる。
 */
function weekdaysForWeeks(weeks: number): string[] {
  const today = new Date();
  const day = today.getDay(); // 0=日
  const monday = new Date(today);
  monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));

  const out: string[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + w * 7 + i);
      out.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
    }
  }
  return out;
}

async function main() {
  await prisma.reservation.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.therapist.deleteMany();
  await prisma.bed.deleteMany();

  await prisma.therapist.createMany({ data: THERAPISTS });
  await prisma.bed.createMany({ data: BEDS });

  const shifts: { therapistId: string; date: string; startTime: string; endTime: string }[] = [];
  for (const date of weekdaysForWeeks(3)) {
    // 午前: 全員（女性 1 + 男性 3）
    for (const t of THERAPISTS) {
      shifts.push({ therapistId: t.id, date, ...MORNING });
    }
    // 午後: 男性 3 名のみ
    for (const t of THERAPISTS.filter((t) => t.gender === "male")) {
      shifts.push({ therapistId: t.id, date, ...AFTERNOON });
    }
  }
  await prisma.shift.createMany({ data: shifts });

  console.log(
    `投入完了: マッサージ師 ${THERAPISTS.length} 名 / ベッド ${BEDS.length} 台 / シフト ${shifts.length} 件（今週から 3 週間ぶんの平日）`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
