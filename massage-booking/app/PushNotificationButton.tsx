"use client";

// ヘッダーに置く「プッシュ通知」ベルボタン（U-1: 学生の決定 = 自動では求めず、押したときだけ確認してから許可ダイアログを出す）。
// オンにする操作だけ確認モーダルを挟む。オフにする操作はワンクリックで即時反映する。
// 管理者・マッサージ師の両画面から使う（MailboxButton と同じ共通コンポーネントの置き場）。

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeToPush, unsubscribeFromPush } from "@/app/actions/push";

type Status = "checking" | "unsupported" | "no-key" | "subscribed" | "unsubscribed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function PushNotificationButton() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<Status> {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
      if (!publicKey) return "no-key";

      try {
        const registration = await navigator.serviceWorker.register("/service-worker.js");
        const sub = await registration.pushManager.getSubscription();
        return sub ? "subscribed" : "unsubscribed";
      } catch {
        return "unsubscribed";
      }
    }

    check().then((result) => {
      if (!cancelled) setStatus(result);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await subscribeToPush({ endpoint: json.endpoint, keys: json.keys });
      setStatus("subscribed");
    } catch {
      // ブラウザの許可ダイアログで「ブロック」を選んだ場合など
      setStatus("unsubscribed");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFromPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("unsubscribed");
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking") return null;
  if (status === "unsupported" || status === "no-key") return null;

  const subscribed = status === "subscribed";

  return (
    <>
      <button
        type="button"
        onClick={() => (subscribed ? disable() : setConfirmOpen(true))}
        disabled={busy}
        aria-label={subscribed ? "プッシュ通知を無効にする" : "プッシュ通知を有効にする"}
        aria-pressed={subscribed}
        title={subscribed ? "プッシュ通知 ON（クリックで解除）" : "プッシュ通知を有効にする"}
        className={`flex size-9 items-center justify-center rounded-full border transition disabled:opacity-60 ${
          subscribed
            ? "border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-300"
            : "border-black/15 text-stone-600 hover:bg-black/[.04] dark:border-white/20 dark:text-stone-300 dark:hover:bg-white/10"
        }`}
      >
        <svg className="size-4.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3a5 5 0 0 0-5 5v3.2c0 .6-.2 1.2-.6 1.7L5 15.5c-.6.7-.1 1.8.8 1.8h12.4c.9 0 1.4-1.1.8-1.8l-1.4-2.6a2.8 2.8 0 0 1-.6-1.7V8a5 5 0 0 0-5-5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path d="M9.5 19a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>

      {confirmOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !busy && setConfirmOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-rose-100 to-orange-50 p-1 shadow-xl dark:from-rose-950/60 dark:to-orange-950/40"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-xl bg-background p-6">
                <h2 className="mb-2 text-lg font-bold text-stone-800 dark:text-stone-100">
                  プッシュ通知をオンにしますか
                </h2>
                <p className="mb-6 text-sm text-black/60 dark:text-white/60">
                  オンにすると、お知らせがこのブラウザにプッシュ通知で届きます。続けて出るブラウザの許可ダイアログでも「許可」を選んでください。
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmOpen(false)}
                    className="rounded-full border border-black/20 px-4 py-2 text-sm dark:border-white/25"
                  >
                    やめる
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={enable}
                    className="rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    {busy ? "設定しています…" : "オンにする"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
