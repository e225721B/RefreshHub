"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createAbsenceRequest,
  previewAbsenceOverlap,
  type AbsenceRequestRow,
  type AbsenceTarget,
} from "@/app/actions/therapist";
import { formatShort, todayString } from "@/lib/dates";

const TARGET_LABEL: Record<AbsenceTarget, string> = { day: "終日", am: "午前のみ", pm: "午後のみ" };

const STATUS_LABEL: Record<AbsenceRequestRow["status"], { text: string; tone: string }> = {
  pending: { text: "申請中", tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200" },
  approved: {
    text: "承認済み",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  },
  rejected: { text: "却下", tone: "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60" },
};

export function AbsenceRequestForm({ initialHistory }: { initialHistory: AbsenceRequestRow[] }) {
  const [date, setDate] = useState(todayString());
  const [target, setTarget] = useState<AbsenceTarget>("day");
  const [reason, setReason] = useState("");
  const [overlap, setOverlap] = useState<number | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startPreview] = useTransition();

  useEffect(() => {
    if (!date) return;
    startPreview(async () => setOverlap(await previewAbsenceOverlap(date, target)));
  }, [date, target, startPreview]);

  async function submit() {
    setSubmitting(true);
    const result = await createAbsenceRequest({ date, target, reason: reason.trim() || undefined });
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) {
      setHistory((prev) => [
        {
          id: `temp-${Date.now()}`,
          date,
          target,
          reason: reason.trim() || null,
          status: "pending",
          createdAt: todayString(),
        },
        ...prev,
      ]);
      setReason("");
    }
    setSubmitting(false);
  }

  return (
    <div className="space-y-6">
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

        {overlap !== null && overlap > 0 && (
          <p className="mt-4 rounded-xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
            この日には予約が {overlap} 件入っています。申請すると管理者に通知され、利用者への連絡は管理者が行います。
          </p>
        )}

        {message && (
          <p
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              message.ok
                ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300"
                : "border-red-600/30 bg-red-600/10 text-red-800 dark:text-red-300"
            }`}
          >
            {message.text}
          </p>
        )}

        <button
          type="button"
          disabled={submitting || !date}
          onClick={submit}
          className="mt-5 rounded-full bg-gradient-to-r from-rose-400 to-orange-300 px-6 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
        >
          {submitting ? "申請しています…" : "休みを申請する"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white/80 dark:border-white/10 dark:bg-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-stone-500 dark:border-white/10 dark:text-stone-400">
              <th className="px-4 py-3 font-medium">日付</th>
              <th className="px-4 py-3 font-medium">対象</th>
              <th className="px-4 py-3 font-medium">理由</th>
              <th className="px-4 py-3 font-medium">申請日</th>
              <th className="px-4 py-3 font-medium">状態</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-stone-400">
                  申請の履歴はありません
                </td>
              </tr>
            ) : (
              history.map((row) => (
                <tr key={row.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-4 py-3">{formatShort(row.date)}</td>
                  <td className="px-4 py-3">{TARGET_LABEL[row.target]}</td>
                  <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{row.reason ?? "—"}</td>
                  <td className="px-4 py-3">{formatShort(row.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_LABEL[row.status].tone}`}
                    >
                      {STATUS_LABEL[row.status].text}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
