// 管理者へのブラウザプッシュ通知（Web Push API）。
// notifyAdmins（app/actions/therapist.ts）から、既存のメールボックス通知に加えて呼ばれる。
// 鍵が未設定の環境（.env に VAPID を入れていない）では何もせず黙って抜ける。

import webpush from "web-push";
import { prisma } from "@/lib/db";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

if (publicKey && privateKey) {
  webpush.setVapidDetails("mailto:admin@example.com", publicKey, privateKey);
}

/**
 * role="admin" かつ active な全ユーザーの購読へ送る。
 * 購読が失効している（410 Gone / 404 Not Found）ものは、その場で削除して掃除する。
 * 送信全体が業務処理（休みの登録など）を止めないよう、例外は投げずログだけ出す。
 */
export async function sendPushToAdmins(title: string, body: string, url = "/admin"): Promise<void> {
  if (!publicKey || !privateKey) return;

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { user: { role: "admin", active: true } },
    });
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({ title, body, url });

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            console.error("プッシュ通知の送信に失敗しました", error);
          }
        }
      }),
    );
  } catch (error) {
    console.error("管理者へのプッシュ通知に失敗しました", error);
  }
}
