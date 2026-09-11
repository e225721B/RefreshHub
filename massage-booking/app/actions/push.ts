"use server";

// 管理者・マッサージ師のブラウザプッシュ通知（Web Push API）の購読管理。
// 公開鍵（NEXT_PUBLIC_VAPID_PUBLIC_KEY）はクライアントから process.env で直接読めるため、ここでは扱わない。

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

type SubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

/** 今の端末・ブラウザの購読情報を保存する。同じ endpoint で登録し直された場合は上書きする */
export async function subscribeToPush(sub: SubscriptionInput): Promise<{ ok: boolean }> {
  const user = await requireRole(["admin", "therapist"]);
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  return { ok: true };
}

/** この端末・ブラウザの購読を止める */
export async function unsubscribeFromPush(endpoint: string): Promise<{ ok: boolean }> {
  await requireRole(["admin", "therapist"]);
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return { ok: true };
}
