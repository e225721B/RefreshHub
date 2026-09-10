"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createReservation, fetchWeekAvailability, type WeekAvailability } from "./actions/booking";
import {
  formatShort,
  formatWeekLabel,
  isPast,
  mondayOf,
  shiftWeek,
  todayString,
  weekdaysFrom,
} from "@/lib/dates";
import { CLEANUP_MIN, STEP_MIN, toHHMM, toMinutes, type Slot } from "@/lib/slots";
import { RESERVATION_UPDATED_EVENT } from "@/lib/events";
import { FlashToast } from "./FlashToast";
import { GuideModal } from "./GuideModal";
import { useFlashMessage } from "./useFlashMessage";

// 表に並べる時間の範囲。稼働時間（9:00〜14:00 / 15:00〜20:00）を含む幅で描き、
// 休憩時間は「空きが無い」として自動的に灰色になる。
const GRID_START = "09:00";
const GRID_END = "20:00";

/** ドラッグで選べる最大マス数。施術は最大 45 分（15 分 × 3 マス）。 */
const MAX_CELLS = 3;

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

/** ドラッグ中の選択範囲 */
type Selection = { date: string; anchorRow: number; hoverRow: number };

export function WeekSchedule({ userName }: { userName: string }) {
  const [monday, setMonday] = useState(() => mondayOf(todayString()));
  const [genders, setGenders] = useState<string[]>(["female", "male"]);
  const [availability, setAvailability] = useState<WeekAvailability>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragging, setDragging] = useState(false);
  const { message, showMessage, clearMessage } = useFlashMessage();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState("");
  const [loading, startLoading] = useTransition();
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => weekdaysFrom(monday), [monday]);
  const rows = useMemo(() => timeRows(), []);
  const today = todayString();
  const gendersKey = genders.join(",");

  const reload = useCallback(async () => {
    setAvailability(await fetchWeekAvailability(monday, genders));
    // gendersKey で依存を表す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday, gendersKey]);

  useEffect(() => {
    startLoading(async () => {
      setAvailability(await fetchWeekAvailability(monday, genders));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday, gendersKey]);

  /** その日・その時刻から 15 分の施術を始められるか（＝マスが空き色になる条件） */
  function isCellOpen(date: string, time: string): boolean {
    if (isPast(date)) return false;
    return Boolean(availability[date]?.[15]?.[time]);
  }

  /** 選択範囲の先頭行・マス数・施術時間 */
  const selected = useMemo(() => {
    if (!selection) return null;
    const start = Math.min(selection.anchorRow, selection.hoverRow);
    const end = Math.max(selection.anchorRow, selection.hoverRow);
    const cells = Math.min(end - start + 1, MAX_CELLS);
    const treatmentMin = cells * STEP_MIN;
    const startTime = rows[start];
    const slot: Slot | undefined = availability[selection.date]?.[treatmentMin]?.[startTime];
    return {
      date: selection.date,
      startRow: start,
      cells,
      treatmentMin,
      startTime,
      blockEndTime: toHHMM(toMinutes(startTime) + treatmentMin + CLEANUP_MIN),
      slot,
      valid: Boolean(slot),
    };
  }, [selection, availability, rows]);

  function isInSelection(date: string, rowIndex: number): boolean {
    if (!selected || selected.date !== date) return false;
    return rowIndex >= selected.startRow && rowIndex < selected.startRow + selected.cells;
  }

  // マウスを離したらドラッグ終了。表の外で離しても止まるように window で拾う。
  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, [dragging]);

  function startDrag(date: string, rowIndex: number) {
    if (saving || loading) return;
    if (!isCellOpen(date, rows[rowIndex])) return;
    clearMessage();
    setSelection({ date, anchorRow: rowIndex, hoverRow: rowIndex });
    setDragging(true);
  }

  function extendDrag(date: string, rowIndex: number) {
    if (!dragging || !selection) return;
    if (date !== selection.date) return; // 別の日にまたがる選択は無効
    setSelection({ ...selection, hoverRow: rowIndex });
  }

  function toggleGender(value: string) {
    setSelection(null);
    setGenders((prev) =>
      prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value],
    );
  }

  /** 「確認する」。ここでは保存せず、内容確認モーダル（U-3）を開くだけ */
  function openConfirm() {
    if (!selected || !selected.valid) return;
    clearMessage();
    setNote("");
    setConfirmOpen(true);
  }

  /** モーダルの「予約を確定する」。ここで実際に保存する */
  async function submitReservation() {
    if (!selected || !selected.slot) return;
    const slot = selected.slot;
    setSaving(true);
    const result = await createReservation({
      date: selected.date,
      startTime: selected.startTime,
      treatmentMin: selected.treatmentMin,
      bedId: slot.bedId,
      therapistId: slot.therapistId,
      note,
    });
    setConfirmOpen(false);
    showMessage(result.ok, result.message);
    if (result.ok) {
      // 「自分の予約」は別コンポーネントで自前管理しているため、
      // イベントで知らせてその場で最新化する（RESERVATION_UPDATED_EVENT）。
      window.dispatchEvent(new Event(RESERVATION_UPDATED_EVENT));
    }
    setSelection(null);
    await reload();
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      {/* 条件 */}
      <div className="flex flex-wrap items-end justify-between gap-6 rounded-2xl border border-rose-100 bg-white p-4 shadow-sm dark:border-rose-500/20 dark:bg-white/[.04]">
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-medium">施術者</legend>
          <div className="flex gap-4 py-2">
            {GENDERS.map((g) => (
              <label key={g.value} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={genders.includes(g.value)}
                  onChange={() => toggleGender(g.value)}
                  className="size-4 accent-rose-500"
                />
                <span>{g.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <GuideModal />
      </div>

      <p className="text-sm text-black/70 dark:text-white/70">
        <strong>表を縦にドラッグして施術時間を選びます。</strong>
        1 マス = 15 分、最大 3 マス（45 分）まで。
        ベッドと施術者は自動で割り当てられます。
      </p>

      <FlashToast message={message} />

      {/*
        選択中の内容と確定ボタン。
        fixed で画面下に浮かせているので、表れても表の位置は動かない
        （＝ドラッグ中に表が動いて違うマスを拾ってしまう事故が起きない）。
      */}
      {selected && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div
            className={`flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              selected.valid
                ? "border-rose-400/50 bg-rose-50/95 dark:bg-rose-950/90"
                : "border-red-600/40 bg-red-50/95 dark:bg-red-950/90"
            }`}
          >
            <div>
              <p className="font-semibold">
                {formatShort(selected.date)} {selected.startTime}
                <span className="font-normal">
                  {" "}
                  から 施術 {selected.treatmentMin} 分（枠は {selected.blockEndTime} まで）
                </span>
              </p>
              {selected.valid && selected.slot ? (
                <p className="text-black/60 dark:text-white/60">
                  {selected.slot.bedName} /{" "}
                  {selected.slot.gender === "female" ? "女性" : "男性"}の施術者
                </p>
              ) : (
                <p className="text-red-800 dark:text-red-300">
                  この長さでは予約できません。長さを短くするか、別の時間を選んでください。
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelection(null)}
                className="rounded-full border border-black/20 px-3 py-2 dark:border-white/25"
              >
                取り消す
              </button>
              <button
                type="button"
                disabled={!selected.valid || saving}
                onClick={openConfirm}
                className="rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-2 font-semibold text-white shadow-sm disabled:opacity-40"
              >
                確認する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 週の切り替え */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => {
            setSelection(null);
            setMonday(shiftWeek(monday, -1));
          }}
          className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
        >
          ◁ 前週
        </button>
        <span className="min-w-28 text-center text-lg font-bold">{formatWeekLabel(monday)}</span>
        <button
          type="button"
          onClick={() => {
            setSelection(null);
            setMonday(shiftWeek(monday, 1));
          }}
          className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
        >
          翌週 ▷
        </button>
        <button
          type="button"
          onClick={() => {
            setSelection(null);
            setMonday(mondayOf(todayString()));
          }}
          className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
        >
          今週
        </button>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-black/60 dark:text-white/60">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-rose-200 dark:bg-rose-400/40" />
          空いている（ドラッグで選ぶ）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-rose-500" />
          選択中
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-black/25 dark:bg-white/30" />
          空きなし（選べません）
        </span>
      </div>

      {/* 週のスケジュール表 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse select-none text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-16 border border-black/10 bg-background px-2 py-2 text-left dark:border-white/15">
                時刻
              </th>
              {days.map((date) => (
                <th
                  key={date}
                  className={`border border-black/10 px-2 py-2 text-center dark:border-white/15 ${
                    date === today ? "border-b-2 border-b-rose-500" : ""
                  }`}
                >
                  {formatShort(date)}
                  {date === today && (
                    <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-normal text-white dark:bg-rose-400 dark:text-rose-950">
                      今日
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((time, rowIndex) => (
              <tr key={time}>
                <th className="sticky left-0 z-10 border border-black/10 bg-background px-2 py-1 text-left font-normal tabular-nums dark:border-white/15">
                  {time.endsWith(":00") ? time : ""}
                </th>
                {days.map((date) => {
                  const open = isCellOpen(date, time);
                  const inSelection = isInSelection(date, rowIndex);
                  const selectionValid = selected?.valid ?? true;

                  let tone = "bg-black/15 dark:bg-white/25"; // 空きなし
                  if (inSelection) {
                    tone = selectionValid
                      ? "bg-rose-500"
                      : "bg-red-500/45";
                  } else if (open) {
                    tone = "bg-rose-100 hover:bg-rose-200 dark:bg-rose-400/20 dark:hover:bg-rose-400/35";
                  }

                  return (
                    <td
                      key={date}
                      onMouseDown={() => startDrag(date, rowIndex)}
                      onMouseEnter={() => extendDrag(date, rowIndex)}
                      title={
                        open
                          ? `${formatShort(date)} ${time} から。ドラッグで長さを変えられます`
                          : "空きがありません"
                      }
                      className={`h-7 border border-black/10 p-0 dark:border-white/15 ${tone} ${
                        open ? "cursor-pointer" : "cursor-not-allowed"
                      }`}
                    >
                      <span className="sr-only">
                        {formatShort(date)} {time} {open ? "空き" : "空きなし"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && <p className="text-center text-sm">空き状況を読み込んでいます…</p>}

      {/* 予約内容の確認（U-3） */}
      {confirmOpen && selected && selected.valid && selected.slot && (
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
              <div className="mb-4 space-y-1 rounded border border-rose-100 px-4 py-3 text-sm dark:border-rose-500/20">
                <p>
                  日時　{formatShort(selected.date)} {selected.startTime}〜{selected.blockEndTime}
                </p>
                <p>施術時間　{selected.treatmentMin} 分</p>
                <p>ベッド　{selected.slot.bedName}</p>
                <p>
                  施術者　{selected.slot.therapistName}（
                  {selected.slot.gender === "female" ? "女性" : "男性"}）
                </p>
                <p>お名前　{userName}</p>
              </div>
              <label className="mb-6 block text-sm">
                <span className="mb-1 block font-medium">備考（任意）</span>
                {/* 狭い画面だけ 16px にする（それ未満だと iOS が画面を拡大し、倍率が残る） */}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={50}
                  rows={2}
                  placeholder="施術者への伝達事項など"
                  className="w-full rounded border border-black/15 bg-background px-3 py-2 text-base sm:text-sm dark:border-white/20"
                />
              </label>
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
                  {saving ? "予約しています…" : "予約を確定する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
