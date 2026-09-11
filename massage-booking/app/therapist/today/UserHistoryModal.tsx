"use client";

import { useEffect, useState } from "react";
import { listUserTreatmentHistory, type UserTreatmentHistory } from "@/app/actions/therapist";
import { formatShort } from "@/lib/dates";

const PAGE_SIZE = 5;

function CalendarIcon() {
  return (
    <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg className="mt-0.5 size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3.5h9l4.5 4.5V20a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M9 12h6M9 15.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** ある利用者の過去の施術一覧。一覧の利用者名クリックから開くモーダル。5 件ずつページ送りする */
export function UserHistoryModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [history, setHistory] = useState<UserTreatmentHistory | null | undefined>(undefined);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let active = true;
    listUserTreatmentHistory(userId).then((h) => {
      if (active) setHistory(h);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const totalPages = history ? Math.max(1, Math.ceil(history.rows.length / PAGE_SIZE)) : 1;
  const pageRows = history ? history.rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {history === undefined ? (
          <p className="p-6 text-sm text-stone-500 dark:text-stone-400">読み込み中…</p>
        ) : history === null ? (
          <p className="p-6 text-sm text-stone-500 dark:text-stone-400">見つかりませんでした</p>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-3 bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-4 text-white sm:px-6 sm:py-5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold ring-1 ring-white/30">
                {history.userName.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/80">過去の施術</p>
                <h2 className="truncate text-lg font-bold">{history.userName} さん</h2>
              </div>
              {history.rows.length > 0 && (
                <span className="ml-auto shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/30">
                  全 {history.rows.length} 件
                </span>
              )}
            </div>

            <div className="overflow-y-auto p-4 sm:p-6">
              <div className="space-y-2">
                {history.rows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-black/15 px-4 py-6 text-center text-sm text-stone-400 dark:border-white/20">
                    過去の施術はありません
                  </p>
                ) : (
                  pageRows.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-rose-100 bg-rose-50/40 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-semibold text-stone-800 dark:text-stone-100">
                          <CalendarIcon />
                          {formatShort(r.date)} {r.startTime}〜{r.endTime}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200 dark:bg-white/10 dark:text-rose-300 dark:ring-rose-500/30">
                          {r.treatmentMin} 分・{r.bedName}
                        </span>
                      </div>
                      {r.note && (
                        <p className="mt-2 flex items-start gap-1.5 border-t border-rose-100 pt-2 text-stone-600 dark:border-white/10 dark:text-stone-300">
                          <NoteIcon />
                          <span>{r.note}</span>
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3 text-sm">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-full border border-black/15 px-3 py-1 transition disabled:opacity-40 dark:border-white/20 enabled:hover:bg-black/[.04] dark:enabled:hover:bg-white/10"
                  >
                    ◁ 前へ
                  </button>
                  <span className="font-medium text-stone-500 dark:text-stone-400">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-full border border-black/15 px-3 py-1 transition disabled:opacity-40 dark:border-white/20 enabled:hover:bg-black/[.04] dark:enabled:hover:bg-white/10"
                  >
                    次へ ▷
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="mt-6 w-full rounded-full border border-black/15 px-4 py-2 text-sm transition hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/10"
              >
                閉じる
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
