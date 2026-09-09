"use client";

import { startTransition, useEffect, useState } from "react";
import { cancelReservation, listMyReservations, type MyReservation } from "./actions/booking";
import { formatShort } from "@/lib/dates";

/** 「マッサージ室の予約」画面の上段に表示する、自分のこれからの予約（B-2 / B-3）。 */
export function MyUpcomingReservations() {
  const [reservations, setReservations] = useState<MyReservation[] | null>(null);
  const [target, setTarget] = useState<MyReservation | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const all = await listMyReservations();
    setReservations(all.filter((r) => r.isUpcoming));
  }

  useEffect(() => {
    startTransition(() => {
      load();
    });
  }, []);

  async function confirmCancel() {
    if (!target) return;
    setCancelling(true);
    const result = await cancelReservation(target.id);
    setMessage({ ok: result.ok, text: result.message });
    setCancelling(false);
    setTarget(null);
    await load();
  }

  // 読み込み中、またはこれからの予約が無ければ何も出さない（レイアウトが空のまま余白だけ残らないように）。
  if (!reservations || reservations.length === 0) return null;

  return (
    <section className="mb-8 space-y-3">
      <h2 className="text-xl font-bold">自分の予約</h2>

      {message && (
        <p
          className={`rounded border px-4 py-3 text-sm ${
            message.ok
              ? "border-green-600/30 bg-green-600/10 text-green-800 dark:text-green-300"
              : "border-red-600/30 bg-red-600/10 text-red-800 dark:text-red-300"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-rose-100 dark:border-rose-500/20">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-rose-50/80 dark:bg-rose-950/30">
              <th className="border-b border-rose-100 px-3 py-2 text-left dark:border-rose-500/20">
                日時
              </th>
              <th className="border-b border-rose-100 px-3 py-2 text-left dark:border-rose-500/20">
                施術時間
              </th>
              <th className="border-b border-rose-100 px-3 py-2 text-left dark:border-rose-500/20">
                ベッド
              </th>
              <th className="border-b border-rose-100 px-3 py-2 text-left dark:border-rose-500/20">
                施術者
              </th>
              <th className="border-b border-rose-100 px-3 py-2 text-left dark:border-rose-500/20">
                状態
              </th>
              <th className="border-b border-rose-100 px-3 py-2 dark:border-rose-500/20" />
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id} className="odd:bg-rose-50/20 dark:odd:bg-rose-950/10">
                <td className="border-b border-rose-100/70 px-3 py-2 dark:border-rose-500/10">
                  {formatShort(r.date)} {r.startTime}〜{r.endTime}
                </td>
                <td className="border-b border-rose-100/70 px-3 py-2 dark:border-rose-500/10">
                  {r.treatmentMin} 分
                </td>
                <td className="border-b border-rose-100/70 px-3 py-2 dark:border-rose-500/10">
                  {r.bedName}
                </td>
                <td className="border-b border-rose-100/70 px-3 py-2 dark:border-rose-500/10">
                  {r.therapistName}
                </td>
                <td className="border-b border-rose-100/70 px-3 py-2 dark:border-rose-500/10">
                  <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300">
                    {r.status}
                  </span>
                </td>
                <td className="border-b border-rose-100/70 px-3 py-2 text-right dark:border-rose-500/10">
                  {r.canCancel && (
                    <button
                      type="button"
                      onClick={() => setTarget(r)}
                      className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                    >
                      キャンセル
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-black/50 dark:text-white/50">
        キャンセルすると、その枠はすぐに他の利用者へ開放されます。
      </p>

      {/* キャンセル確認ダイアログ */}
      {target && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !cancelling && setTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-gradient-to-b from-rose-100 to-orange-50 p-1 shadow-xl dark:from-rose-950/60 dark:to-orange-950/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-xl bg-background p-6">
              <h2 className="mb-4 text-lg font-bold">この予約をキャンセルしますか</h2>
              <div className="mb-4 rounded border border-rose-100 px-4 py-3 text-sm dark:border-rose-500/20">
                <p>
                  {formatShort(target.date)} {target.startTime}〜{target.endTime}／{target.treatmentMin} 分
                </p>
                <p className="text-black/60 dark:text-white/60">
                  {target.bedName} / {target.therapistName}
                </p>
              </div>
              <p className="mb-6 text-sm text-black/60 dark:text-white/60">
                キャンセルした枠は他の利用者に開放されます。
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => setTarget(null)}
                  className="rounded-full border border-black/20 px-4 py-2 text-sm dark:border-white/25"
                >
                  やめる
                </button>
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={confirmCancel}
                  className="rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {cancelling ? "確定しています…" : "確定する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
