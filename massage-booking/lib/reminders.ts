/**
 * 当日予約の朝の一括通知（AC-12、design.md D-2 の再々改訂 2026-09-10）。
 * Vercel の無料プランは Cron の実行頻度が1日1回までのため、「施術15分前」ではなく
 * 「毎朝9時に、その日の予約をまとめて知らせる」方式に変更した。
 *
 * 利用者: その日の自分の予約（複数あれば全件）を1通で受け取る。
 * マッサージ師: その日に担当する予約をすべてまとめた1通を受け取る（利用者ごとに分けない）。
 */

import { prisma } from "@/lib/db";
import { hhmmOfLocal, todayString, toDateTime } from "@/lib/dates";
import { sendSlackDM } from "@/lib/slack";
import { dailyDigestMessageForTherapist, dailyDigestMessageForUser } from "@/lib/notification-messages";

function appBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  // Vercel が自動で設定する本番ドメイン。APP_BASE_URL を明示していない環境でも
  // localhost に落ちてキャンセル導線が壊れないようにするための保険。
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

function todayRange(): { start: Date; end: Date } {
  const today = todayString();
  const start = toDateTime(today, "00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function sendDailyDigest(): Promise<{ usersNotified: number; therapistsNotified: number }> {
  const { start, end } = todayRange();

  const reservations = await prisma.reservation.findMany({
    where: {
      status: "booked",
      reminderSentAt: null,
      startAt: { gte: start, lt: end },
    },
    include: { user: true, therapist: { include: { user: true } }, bed: true },
    orderBy: { startAt: "asc" },
  });

  if (reservations.length === 0) {
    return { usersNotified: 0, therapistsNotified: 0 };
  }

  const cancelUrl = `${appBaseUrl()}/#my-reservations`;

  const byUser = new Map<string, typeof reservations>();
  const byTherapist = new Map<string, typeof reservations>();
  for (const r of reservations) {
    byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
    byTherapist.set(r.therapistId, [...(byTherapist.get(r.therapistId) ?? []), r]);
  }

  for (const [, items] of byUser) {
    const user = items[0].user;
    await sendSlackDM(
      user.email,
      dailyDigestMessageForUser({
        items: items.map((r) => ({
          startTime: hhmmOfLocal(r.startAt),
          endTime: hhmmOfLocal(r.endAt),
          bedName: r.bed.name,
          therapistName: r.therapist.user.name,
        })),
        cancelUrl,
      }),
    );
  }

  for (const [, items] of byTherapist) {
    const therapistUser = items[0].therapist.user;
    await sendSlackDM(
      therapistUser.email,
      dailyDigestMessageForTherapist({
        items: items.map((r) => ({
          startTime: hhmmOfLocal(r.startAt),
          endTime: hhmmOfLocal(r.endAt),
          bedName: r.bed.name,
          userName: r.user.name,
        })),
      }),
    );
  }

  await prisma.reservation.updateMany({
    where: { id: { in: reservations.map((r) => r.id) } },
    data: { reminderSentAt: new Date() },
  });

  return { usersNotified: byUser.size, therapistsNotified: byTherapist.size };
}
