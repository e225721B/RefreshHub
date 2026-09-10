"use client";

import { useEffect, useState } from "react";
import { getReservationDetail, type AssignmentDetail } from "@/app/actions/therapist";
import { formatShort } from "@/lib/dates";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 px-4 py-3 dark:border-white/10">
      <dt className="text-xs text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="mt-0.5 text-base font-bold text-stone-800 dark:text-stone-100">{value}</dd>
    </div>
  );
}

/** 予約詳細（T-4）。一覧の「詳細」から開くモーダル。 */
export function ReservationDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AssignmentDetail | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getReservationDetail(id).then((d) => {
      if (active) setDetail(d);
    });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {detail === undefined ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">読み込み中…</p>
        ) : detail === null ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">見つかりませんでした</p>
        ) : (
          <>
            <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">
              {formatShort(detail.date)}の予約
            </h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <Row label="利用者" value={detail.userName} />
              <Row
                label="施術時間・ベッド"
                value={`${detail.startTime}〜${detail.endTime}（${detail.treatmentMin} 分）・${detail.bedName}`}
              />
              <Row
                label="利用回数"
                value={
                  detail.previousDate
                    ? `${detail.visitCount} 回目（前回 ${formatShort(detail.previousDate)}）`
                    : `${detail.visitCount} 回目（はじめて）`
                }
              />
              {detail.note && <Row label="備考" value={detail.note} />}
            </dl>
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
