"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { createReservation, findQuickSlot, type QuickSlotResult } from "./actions/booking";
import { formatShort } from "@/lib/dates";
import { RESERVATION_UPDATED_EVENT } from "@/lib/events";
import { toHHMM, toMinutes } from "@/lib/slots";
import { FlashToast } from "./FlashToast";
import { useFlashMessage } from "./useFlashMessage";

const MINUTES_OPTIONS = [15, 30, 60] as const;
const TREATMENT_OPTIONS = [15, 30, 45] as const;

const PILL = "rounded-full border px-4 py-2 text-sm font-medium transition";
const PILL_OFF =
  "border-black/15 bg-white text-black/70 hover:bg-rose-50 dark:border-white/20 dark:bg-transparent dark:text-white/70 dark:hover:bg-white/10";
const PILL_ON = "border-transparent bg-rose-500 text-white shadow-sm";

/**
 * トップ画面の「かんたん予約」。3 つ選ぶだけで、空いていればその場で予約できる。
 * 週表示（/booking）と違い、条件に合う一番早い枠を自動で 1 つ探して提示する。
 */
export function QuickBooking({ userName }: { userName: string }) {
  const [minutesFromNow, setMinutesFromNow] = useState<(typeof MINUTES_OPTIONS)[number]>(15);
  const [treatmentMin, setTreatmentMin] = useState<(typeof TREATMENT_OPTIONS)[number]>(30);
  const [femaleOnly, setFemaleOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<QuickSlotResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { message, showMessage } = useFlashMessage();

  async function reload() {
    setLoading(true);
    const next = await findQuickSlot({
      minutesFromNow,
      treatmentMin,
      genders: femaleOnly ? ["female"] : [],
    });
    setResult(next);
    setLoading(false);
  }

  useEffect(() => {
    startTransition(() => {
      reload();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutesFromNow, treatmentMin, femaleOnly]);

  async function submitReservation() {
    if (!result || !result.ok) return;
    setSaving(true);
    const outcome = await createReservation({
      date: result.date,
      startTime: result.startTime,
      treatmentMin: result.treatmentMin,
      bedId: result.bedId,
      therapistId: result.therapistId,
    });
    setConfirmOpen(false);
    showMessage(outcome.ok, outcome.message);
    if (outcome.ok) {
      window.dispatchEvent(new Event(RESERVATION_UPDATED_EVENT));
    }
    await reload();
    setSaving(false);
  }

  return (
    <>
      <FlashToast message={message} />

      <div className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm dark:border-rose-500/20 dark:bg-white/[.04] sm:p-6">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">かんたん予約</h2>
          <p className="text-sm text-black/60 dark:text-white/60">
            3 つ選ぶだけ。空いていればそのまま確定できます。
          </p>
        </div>

        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-black/70 dark:text-white/70">いつから</legend>
            <div className="flex flex-wrap gap-2">
              {MINUTES_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutesFromNow(m)}
                  className={`${PILL} ${minutesFromNow === m ? PILL_ON : PILL_OFF}`}
                >
                  {m} 分後
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-black/70 dark:text-white/70">施術時間</legend>
            <div className="flex flex-wrap gap-2">
              {TREATMENT_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTreatmentMin(t)}
                  className={`${PILL} ${treatmentMin === t ? PILL_ON : PILL_OFF}`}
                >
                  {t} 分
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={femaleOnly}
              onChange={(e) => setFemaleOnly(e.target.checked)}
              className="size-4 accent-rose-500"
            />
            女性の施術者を希望する
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-100 bg-rose-50/60 px-4 py-3 dark:border-rose-500/20 dark:bg-rose-500/5">
          {loading ? (
            <p className="text-sm text-black/60 dark:text-white/60">空き状況を確認しています…</p>
          ) : result?.ok ? (
            <>
              <div>
                <p className="font-semibold">
                  {result.startTime} 〜 {toHHMM(toMinutes(result.startTime) + result.treatmentMin)} ／{" "}
                  {result.treatmentMin} 分の施術
                </p>
                <p className="text-sm text-black/60 dark:text-white/60">施術者とベッドは自動で割り当てます</p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              >
                この時間で予約する
              </button>
            </>
          ) : (
            <>
              <p className="font-semibold text-red-600 dark:text-red-400">{result?.message}</p>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-full bg-black/15 px-5 py-2.5 text-sm font-semibold text-black/40 dark:bg-white/15 dark:text-white/40"
              >
                この時間で予約する
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white/70 px-5 py-4 text-sm dark:bg-white/[.03]">
        <p className="text-black/70 dark:text-white/70">
          明日以降の予約や、時間・施術者をもっと細かく選びたいときは予約ページからどうぞ。
        </p>
        <Link
          href="/booking"
          className="shrink-0 rounded-full border border-rose-300 bg-white px-4 py-2 font-semibold text-rose-700 shadow-sm hover:bg-rose-50 dark:border-rose-400/40 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-500/10"
        >
          予約ページを開く
        </Link>
      </div>

      {confirmOpen && result?.ok && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !saving && setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-gradient-to-b from-rose-100 to-orange-50 p-1 shadow-xl dark:from-rose-950/60 dark:to-orange-950/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-xl bg-background p-6">
              <h2 className="mb-4 text-lg font-bold">この内容で予約しますか</h2>
              <div className="mb-6 space-y-1 rounded border border-rose-100 px-4 py-3 text-sm dark:border-rose-500/20">
                <p>
                  日時　{formatShort(result.date)} {result.startTime}〜{result.blockEndTime}
                </p>
                <p>施術時間　{result.treatmentMin} 分</p>
                <p>ベッド　{result.bedName}</p>
                <p>
                  施術者　{result.therapistName}（{result.gender === "female" ? "女性" : "男性"}）
                </p>
                <p>お名前　{userName}</p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-full border border-black/20 px-4 py-2 text-sm dark:border-white/25"
                >
                  戻る
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={submitReservation}
                  className="rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {saving ? "予約しています…" : "この時間で予約する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
