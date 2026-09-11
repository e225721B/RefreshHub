"use client";

import { useEffect, useState, useTransition } from "react";
import {
  cancelAbsence,
  listMyAbsences,
  previewAbsenceOverlap,
  registerAbsence,
  type AbsenceRow,
  type AbsenceTarget,
} from "@/app/actions/therapist";
import { formatShort, todayString } from "@/lib/dates";
import { FlashToast } from "@/app/FlashToast";
import { useFlashMessage } from "@/app/useFlashMessage";

export function AbsenceForm({ initialHistory }: { initialHistory: AbsenceRow[] }) {
  const [date, setDate] = useState(todayString());
  const [target, setTarget] = useState<AbsenceTarget>("day");
  const [reason, setReason] = useState("");
  const [overlap, setOverlap] = useState<number | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [submitting, setSubmitting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<AbsenceRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { message, showMessage } = useFlashMessage();
  const [, startPreview] = useTransition();

  useEffect(() => {
    if (!date) return;
    startPreview(async () => setOverlap(await previewAbsenceOverlap(date, target)));
  }, [date, target, startPreview]);

  const blocked = overlap !== null && overlap > 0;

  async function submit() {
    setSubmitting(true);
    const result = await registerAbsence({ date, target, reason: reason.trim() || undefined });
    showMessage(result.ok, result.message);
    if (result.ok) {
      setHistory(await listMyAbsences());
      setReason("");
    }
    setSubmitting(false);
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    const result = await cancelAbsence(cancelTarget.id);
    showMessage(result.ok, result.message);
    if (result.ok) {
      setHistory(await listMyAbsences());
    }
    setCancelling(false);
    setCancelTarget(null);
  }

  return (
    <div className="space-y-6">
      <FlashToast message={message} />

      <div className="rounded-2xl border border-black/10 bg-white/80 p-6 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700 dark:text-stone-200">日付</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700 dark:text-stone-200">対象</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as AbsenceTarget)}
              className="rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            >
              <option value="day">終日</option>
              <option value="am">午前のみ</option>
              <option value="pm">午後のみ</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-stone-700 dark:text-stone-200">理由（任意）</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="通院のため"
              className="rounded-lg border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            />
          </label>
        </div>

        {blocked && (
          <p className="mt-4 rounded-xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
            この時間帯には予約が {overlap} 件入っているため、休みを登録できません。
          </p>
        )}

        <button
          type="button"
          disabled={submitting || !date || blocked}
          onClick={submit}
          className="mt-5 rounded-full bg-gradient-to-r from-rose-400 to-orange-300 px-6 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
        >
          {submitting ? "登録しています…" : "休みを登録する"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white/80 dark:border-white/10 dark:bg-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-stone-500 dark:border-white/10 dark:text-stone-400">
              <th className="px-4 py-3 font-medium">日付</th>
              <th className="px-4 py-3 font-medium">時間帯</th>
              <th className="px-4 py-3 font-medium">理由</th>
              <th className="px-4 py-3 font-medium">登録日</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-stone-400">
                  登録した休みはありません
                </td>
              </tr>
            ) : (
              history.map((row) => (
                <tr key={row.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-4 py-3">{formatShort(row.date)}</td>
                  <td className="px-4 py-3">
                    {row.startTime}〜{row.endTime}
                  </td>
                  <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{row.reason ?? "—"}</td>
                  <td className="px-4 py-3">{formatShort(row.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setCancelTarget(row)}
                      className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium transition hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/10"
                    >
                      取り消す
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 取消の確認ダイアログ */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !cancelling && setCancelTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-gradient-to-b from-rose-100 to-orange-50 p-1 shadow-xl dark:from-rose-950/60 dark:to-orange-950/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-xl bg-background p-6">
              <h2 className="mb-4 text-lg font-bold text-stone-800 dark:text-stone-100">
                この休みを取り消しますか
              </h2>
              <div className="mb-4 rounded border border-rose-100 px-4 py-3 text-sm dark:border-rose-500/20">
                <p>
                  {formatShort(cancelTarget.date)} {cancelTarget.startTime}〜{cancelTarget.endTime}
                </p>
                {cancelTarget.reason && (
                  <p className="text-black/60 dark:text-white/60">{cancelTarget.reason}</p>
                )}
              </div>
              <p className="mb-6 text-sm text-black/60 dark:text-white/60">
                取り消すと、この時間帯はまた予約を受け付けられるようになります。
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => setCancelTarget(null)}
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
                  {cancelling ? "取り消しています…" : "取り消す"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
