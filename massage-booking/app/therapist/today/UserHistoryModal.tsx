"use client";

import { useEffect, useState } from "react";
import { listUserTreatmentHistory, type UserTreatmentHistory } from "@/app/actions/therapist";
import { formatShort } from "@/lib/dates";

const PAGE_SIZE = 5;

/** ある利用者の過去の施術一覧。一覧の利用者名クリックから開くモーダル。5 件ずつページ送りする */
export function UserHistoryModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [history, setHistory] = useState<UserTreatmentHistory | null | undefined>(undefined);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let active = true;
    // 表示中の利用者が変わるたびに前回の内容をリセットしてから取得し直す（意図的な同期リセット）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(undefined);
    setPage(0);
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
        className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {history === undefined ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">読み込み中…</p>
        ) : history === null ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">見つかりませんでした</p>
        ) : (
          <>
            <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">
              {history.userName} さんの過去の施術
            </h2>

            <div className="mt-4 space-y-2">
              {history.rows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-black/15 px-4 py-6 text-center text-sm text-stone-400 dark:border-white/20">
                  過去の施術はありません
                </p>
              ) : (
                pageRows.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-black/10 px-4 py-3 text-sm dark:border-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-stone-800 dark:text-stone-100">
                        {formatShort(r.date)} {r.startTime}〜{r.endTime}
                      </span>
                      <span className="text-stone-500 dark:text-stone-400">
                        {r.treatmentMin} 分・{r.bedName}
                      </span>
                    </div>
                    <p className="mt-1.5 border-t border-black/5 pt-1.5 text-stone-600 dark:border-white/10 dark:text-stone-300">
                      備考：{r.note ?? ""}
                    </p>
                  </div>
                ))
              )}
            </div>

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-center gap-3 text-sm">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-full border border-black/15 px-3 py-1 disabled:opacity-40 dark:border-white/20"
                >
                  ◁ 前へ
                </button>
                <span className="text-stone-500 dark:text-stone-400">
                  {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-full border border-black/15 px-3 py-1 disabled:opacity-40 dark:border-white/20"
                >
                  次へ ▷
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-full border border-black/15 px-4 py-2 text-sm dark:border-white/20"
            >
              閉じる
            </button>
          </>
        )}
      </div>
    </div>
  );
}
