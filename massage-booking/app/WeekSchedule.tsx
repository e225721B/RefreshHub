"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  createReservation,
  fetchWeekAvailability,
  listActiveUsersForBooking,
  type WeekAvailability,
} from "./actions/booking";
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
import { GuideModal } from "./GuideModal";

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

export function WeekSchedule() {
  const [monday, setMonday] = useState(() => mondayOf(todayString()));
  const [genders, setGenders] = useState<string[]>(["female", "male"]);
  // 暫定: ログイン機能（A-1）が入るまでの橋渡し。それまでは一覧から選ぶ（app/actions/booking.ts 参照）。
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [userId, setUserId] = useState("");
  const [availability, setAvailability] = useState<WeekAvailability>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
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

  useEffect(() => {
    listActiveUsersForBooking().then((list) => {
      setUsers(list);
      setUserId((current) => current || list[0]?.id || "");
    });
  }, []);

  /** その日・その時刻から 15 分の施術を始められるか（＝マスが緑になる条件） */
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
    setMessage(null);
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

  async function confirmReservation() {
    if (!selected || !selected.slot) return;
    if (!userId) {
      setMessage({ ok: false, text: "利用者を選んでください" });
      return;
    }
    setSaving(true);
    const result = await createReservation({
      userId,
      date: selected.date,
      startTime: selected.startTime,
      treatmentMin: selected.treatmentMin,
      bedId: selected.slot.bedId,
      therapistId: selected.slot.therapistId,
    });
    setMessage({ ok: result.ok, text: result.message });
    setSelection(null);
    await reload();
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      {/* 条件 */}
      <div className="flex flex-wrap items-end gap-6 rounded-lg border border-black/10 bg-black/[.02] p-4 dark:border-white/15 dark:bg-white/[.04]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">利用者</span>
          {/* 暫定: ログイン機能（A-1）が入るまでの橋渡し。ログイン後は自動で入るようになる（B-1）。 */}
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded border border-black/20 px-3 py-2 dark:border-white/25 dark:bg-transparent"
          >
            {users.length === 0 && <option value="">読み込み中…</option>}
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

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

      <p className="text-sm text-black/70 dark:text-white/70">
        <strong>表を縦にドラッグして施術時間を選びます。</strong>
        1 マス = 15 分、最大 3 マス（45 分）まで。
        清掃・準備の 15 分は自動で足されるため、押さえる枠はドラッグした長さ + 15 分になります。
        ベッドと施術者は自動で割り当てられます。
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

      {/*
        選択中の内容と確定ボタン。
        高さを常に確保しておくのは、ドラッグの途中でこの欄が現れて
        表が下にずれると、狙ったマスと違うマスが選ばれてしまうため。
      */}
      <div className="min-h-20">
        {selected ? (
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
              selected.valid
                ? "border-blue-600/40 bg-blue-500/10"
                : "border-red-600/40 bg-red-600/10"
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
                className="rounded border border-black/20 px-3 py-2 dark:border-white/25"
              >
                取り消す
              </button>
              <button
                type="button"
                disabled={!selected.valid || saving}
                onClick={confirmReservation}
                className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-40"
              >
                {saving ? "予約しています…" : "この内容で予約する"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center rounded-lg border border-dashed border-black/15 px-4 py-3 text-sm text-black/50 dark:border-white/20 dark:text-white/50">
            表の緑のマスを縦にドラッグすると、ここに予約内容が出ます。
          </div>
        )}
      </div>

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
          <span className="inline-block size-3 rounded-sm bg-emerald-500/25" />
          空いている（ドラッグで選ぶ）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-blue-500/50" />
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
                      ? "bg-blue-500/50"
                      : "bg-red-500/45";
                  } else if (open) {
                    tone = "bg-emerald-500/10 dark:bg-emerald-400/15 hover:bg-emerald-500/30";
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
    </div>
  );
}
