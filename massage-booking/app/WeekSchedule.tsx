"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createReservation, fetchWeekSlots, type WeekSlots } from "./actions";
import {
  formatShort,
  formatWeekLabel,
  isPast,
  mondayOf,
  shiftWeek,
  todayString,
  weekdaysFrom,
} from "@/lib/dates";
import { STEP_MIN, TREATMENT_OPTIONS, toHHMM, toMinutes, type Slot } from "@/lib/slots";
import { GuideModal } from "./GuideModal";

// 表に並べる時間の範囲。要件の稼働時間（9:00〜14:00 / 15:00〜19:00）を含む幅で描き、
// 休憩時間は「空きが無い」として自動的に灰色になる。
const GRID_START = "09:00";
const GRID_END = "19:00";

const GENDERS = [
  { value: "female" as const, label: "女性" },
  { value: "male" as const, label: "男性" },
];

function timeRows(): string[] {
  const rows: string[] = [];
  for (let t = toMinutes(GRID_START); t < toMinutes(GRID_END); t += STEP_MIN) {
    rows.push(toHHMM(t));
  }
  return rows;
}

export function WeekSchedule() {
  const [monday, setMonday] = useState(() => mondayOf(todayString()));
  const [treatmentMin, setTreatmentMin] = useState<number>(45);
  const [genders, setGenders] = useState<string[]>(["female", "male"]);
  const [userName, setUserName] = useState("");
  const [weekSlots, setWeekSlots] = useState<WeekSlots>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => weekdaysFrom(monday), [monday]);
  const rows = useMemo(() => timeRows(), []);
  const today = todayString();

  async function reload() {
    setWeekSlots(await fetchWeekSlots(monday, treatmentMin, genders));
  }

  useEffect(() => {
    startLoading(async () => {
      setWeekSlots(await fetchWeekSlots(monday, treatmentMin, genders));
    });
    // genders は配列なので join して依存に渡す
  }, [monday, treatmentMin, genders.join(",")]);

  function toggleGender(value: string) {
    setGenders((prev) =>
      prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value],
    );
  }

  async function reserve(date: string, slot: Slot) {
    if (!userName.trim()) {
      setMessage({ ok: false, text: "お名前を入力してください" });
      return;
    }
    if (!confirm(`${formatShort(date)} ${slot.startTime}〜${slot.blockEndTime} で予約しますか？`)) {
      return;
    }
    setSaving(true);
    const result = await createReservation({
      userName,
      date,
      startTime: slot.startTime,
      treatmentMin,
      bedId: slot.bedId,
      therapistId: slot.therapistId,
    });
    setMessage({ ok: result.ok, text: result.message });
    await reload();
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      {/* 条件 */}
      <div className="flex flex-wrap items-end gap-5 rounded-lg border border-black/10 bg-black/[.02] p-4 dark:border-white/15 dark:bg-white/[.04]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">お名前</span>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="山田 太郎"
            maxLength={50}
            className="rounded border border-black/20 px-3 py-2 dark:border-white/25 dark:bg-transparent"
          />
        </label>

        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-medium">施術時間</legend>
          <div className="flex gap-2">
            {TREATMENT_OPTIONS.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => setTreatmentMin(min)}
                className={`rounded border px-3 py-2 ${
                  treatmentMin === min
                    ? "border-transparent bg-foreground text-background"
                    : "border-black/20 dark:border-white/25"
                }`}
              >
                {min} 分
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-medium">施術者</legend>
          <div className="flex gap-4 py-2">
            {GENDERS.map((g) => (
              <label key={g.value} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={genders.includes(g.value)}
                  onChange={() => toggleGender(g.value)}
                  className="size-4"
                />
                <span>{g.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <GuideModal />
      </div>

      <p className="text-sm text-black/60 dark:text-white/60">
        施術 {treatmentMin} 分の場合、清掃・準備を含めて{" "}
        <strong>{treatmentMin + 15} 分</strong> の枠を押さえます。
        ベッドは自動で割り当てられます。
      </p>

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

      {/* 週の切り替え */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setMonday(shiftWeek(monday, -1))}
          className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
        >
          ◁ 前週
        </button>
        <span className="min-w-28 text-center text-lg font-bold">{formatWeekLabel(monday)}</span>
        <button
          type="button"
          onClick={() => setMonday(shiftWeek(monday, 1))}
          className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
        >
          翌週 ▷
        </button>
        <button
          type="button"
          onClick={() => setMonday(mondayOf(todayString()))}
          className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
        >
          今週
        </button>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-black/60 dark:text-white/60">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-emerald-500/25" />
          予約できる（クリックで予約）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-black/25 dark:bg-white/30" />
          空きなし（選べません）
        </span>
      </div>

      {/* 週のスケジュール表 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-16 border border-black/10 bg-background px-2 py-2 text-left dark:border-white/15">
                時刻
              </th>
              {days.map((date) => (
                <th
                  key={date}
                  className={`border border-black/10 px-2 py-2 text-center dark:border-white/15 ${
                    date === today ? "bg-blue-500/10" : ""
                  }`}
                >
                  {formatShort(date)}
                  {date === today && (
                    <span className="ml-1 text-xs font-normal text-blue-700 dark:text-blue-300">
                      今日
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((time) => (
              <tr key={time}>
                <th className="sticky left-0 z-10 border border-black/10 bg-background px-2 py-1 text-left font-normal tabular-nums dark:border-white/15">
                  {time.endsWith(":00") ? time : ""}
                </th>
                {days.map((date) => {
                  const slot = weekSlots[date]?.[time];
                  const past = isPast(date);
                  const available = Boolean(slot) && !past;
                  return (
                    <td
                      key={date}
                      className={`border border-black/10 p-0 dark:border-white/15 ${
                        available
                          ? "bg-emerald-500/10 dark:bg-emerald-400/15"
                          : "bg-black/15 dark:bg-white/25"
                      }`}
                    >
                      {available && slot ? (
                        <button
                          type="button"
                          disabled={saving || loading}
                          onClick={() => reserve(date, slot)}
                          title={`${slot.startTime}〜${slot.blockEndTime} / ${
                            slot.gender === "female" ? "女性" : "男性"
                          }の施術者`}
                          className="h-7 w-full cursor-pointer text-xs text-emerald-800 hover:bg-emerald-500/35 disabled:opacity-50 dark:text-emerald-200"
                        >
                          <span aria-hidden>空</span>
                          <span className="sr-only">
                            {formatShort(date)} {time} を予約する
                          </span>
                        </button>
                      ) : (
                        <div className="h-7" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && <p className="text-center text-sm">空き枠を探しています…</p>}

      {genders.length === 0 && (
        <p className="text-center text-sm text-black/60 dark:text-white/60">
          施術者の性別のチェックをすべて外すと、絞り込みなし（どちらでもよい）として表示します。
        </p>
      )}
    </div>
  );
}
