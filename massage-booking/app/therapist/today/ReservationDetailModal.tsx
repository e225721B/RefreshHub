"use client";

import { useEffect, useState } from "react";
import { getReservationDetail, type AssignmentDetail } from "@/app/actions/therapist";
import { formatShort } from "@/lib/dates";

function UserIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 19.5c1.4-3.4 4.4-5 7.5-5s6.1 1.6 7.5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 7h9a3 3 0 0 1 3 3v1M18 17H9a3 3 0 0 1-3-3v-1M9 4l-3 3 3 3M15 20l3-3-3-3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3.5h9l4.5 4.5V20a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M9 12h6M9 15.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Row({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
        accent
          ? "border-rose-200/70 bg-rose-50/50 dark:border-rose-400/20 dark:bg-rose-500/10"
          : "border-black/10 dark:border-white/10"
      }`}
    >
      <span
        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
          accent
            ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300"
            : "bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-400"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-stone-500 dark:text-stone-400">{label}</dt>
        <dd className="mt-0.5 text-base font-bold text-stone-800 dark:text-stone-100">{value}</dd>
      </div>
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
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {detail === undefined ? (
          <p className="p-6 text-sm text-stone-500 dark:text-stone-400">読み込み中…</p>
        ) : detail === null ? (
          <p className="p-6 text-sm text-stone-500 dark:text-stone-400">見つかりませんでした</p>
        ) : (
          <>
            <div className="bg-gradient-to-r from-rose-500 to-orange-400 px-6 py-5 text-white">
              <p className="text-xs font-medium text-white/80">予約の詳細</p>
              <h2 className="text-lg font-bold">{formatShort(detail.date)}の予約</h2>
            </div>

            <div className="p-6">
              <dl className="space-y-2.5 text-sm">
                <Row icon={<UserIcon />} label="利用者" value={detail.userName} />
                <Row
                  icon={<ClockIcon />}
                  label="施術時間・ベッド"
                  value={`${detail.startTime}〜${detail.endTime}（${detail.treatmentMin} 分）・${detail.bedName}`}
                />
                <Row
                  icon={<RepeatIcon />}
                  label="利用回数"
                  accent={!detail.previousDate}
                  value={
                    detail.previousDate ? (
                      `${detail.visitCount} 回目（前回 ${formatShort(detail.previousDate)}）`
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        はじめて
                        <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                          NEW
                        </span>
                      </span>
                    )
                  }
                />
                {detail.note && <Row icon={<NoteIcon />} label="備考" value={detail.note} />}
              </dl>
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
