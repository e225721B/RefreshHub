"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { listMyMailbox, markAllMailboxRead, type MailboxMessageRow } from "@/app/actions/mailbox";

/**
 * ヘッダーに置くメールボックス（LINE のようにアイコン右上へ未読件数を出す）。
 * 開くと画面中央にモーダルで一覧を表示し、未読を一括で既読にする。
 */
export function MailboxButton({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [messages, setMessages] = useState<MailboxMessageRow[] | null>(null);

  async function openMailbox() {
    setOpen(true);
    const rows = await listMyMailbox();
    setMessages(rows);
    if (unreadCount > 0) {
      setUnreadCount(0);
      await markAllMailboxRead();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openMailbox}
        aria-label="メールボックス"
        className="relative flex size-9 items-center justify-center rounded-full border border-black/15 text-stone-600 transition hover:bg-black/[.04] dark:border-white/20 dark:text-stone-300 dark:hover:bg-white/10"
      >
        <svg className="size-4.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.7" />
          <path d="m4 8 7.1 4.6a2 2 0 0 0 2.2 0L20.5 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          // ヘッダーの backdrop-blur が fixed 要素の基準をヘッダー自身にしてしまうため、
          // document.body 直下に portal してビューポート全体を基準に中央寄せする。
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-background p-4 shadow-xl sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="shrink-0 text-lg font-bold text-stone-800 dark:text-stone-100">お知らせ</h2>

              <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
                {messages === null ? (
                  <p className="py-10 text-center text-sm text-stone-400">読み込み中…</p>
                ) : messages.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-black/15 px-4 py-10 text-center text-sm text-stone-400 dark:border-white/20">
                    お知らせはありません
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
                        m.unread
                          ? "border-rose-200/70 bg-rose-50/80 dark:border-rose-400/20 dark:bg-rose-500/10"
                          : "border-black/10 dark:border-white/10"
                      }`}
                    >
                      {m.unread && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-rose-500" aria-hidden="true" />
                      )}
                      <div>
                        <p className="text-stone-700 dark:text-stone-200">{m.body}</p>
                        <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">{m.createdAtLabel}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-6 w-full shrink-0 rounded-full border border-black/15 px-4 py-2 text-sm dark:border-white/20"
              >
                閉じる
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
