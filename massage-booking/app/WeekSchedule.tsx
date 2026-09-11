"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  createReservation,
  fetchWeekAvailability,
  getBookedReservationInWeek,
  type WeekAvailability,
  type WeekBooking,
} from "./actions/booking";
import {
  formatShort,
  formatWeekLabel,
  isPast,
  isStartPassed,
  mondayOf,
  shiftWeek,
  todayString,
  weekdaysFrom,
} from "@/lib/dates";
import { CLEANUP_MIN, STEP_MIN, toHHMM, toMinutes, type Slot } from "@/lib/slots";
import { GENDER_LABEL, GENDERS, isGender } from "@/lib/roles";
import type { SelectableTherapist } from "@/lib/therapists";
import { RESERVATION_UPDATED_EVENT } from "@/lib/events";
import { FlashToast } from "./FlashToast";
import { useFlashMessage } from "./useFlashMessage";

// 表に並べる時間の範囲。稼働時間（9:00〜14:00 / 15:00〜20:00）を含む幅で描き、
// 休憩時間は「空きが無い」として自動的に灰色になる。
const GRID_START = "09:00";
const GRID_END = "20:00";

/** ドラッグで選べる最大マス数。施術は最大 45 分（15 分 × 3 マス）。 */
const MAX_CELLS = 3;

// 表の列の幅（rem）。時刻列と日付列。
const TIME_COL_REM = 4;
const DAY_COL_REM = 6.5;

// 「あなたの予約」の時間帯。青だと他の予約系の色（rose 系）から浮くため、
// rose の細い斜め線パターンにして「選べないが、他とは違う」ことを示す。
//
// Tailwind の bg-[...] にすると、ビルド時の CSS 圧縮が同色の連続する色停止点
// （例: #fda4af が 0px と 2px の 2 箇所）を "色 開始位置 終了位置" という
// 新しい書き方 1 つにまとめてしまう。この書き方に対応していない Safari では
// 縞模様の背景が丸ごと描画されず、真っ白に見える（実機のスマホで確認）。
// そのため、この背景だけは Tailwind のクラスではなく、圧縮されない
// インラインスタイルとして直接指定する。
const MY_BOOKED_STRIPE_LIGHT =
  "repeating-linear-gradient(45deg, #fda4af 0px, #fda4af 2px, #fecdd3 2px, #fecdd3 14px)";
const MY_BOOKED_STRIPE_DARK =
  "repeating-linear-gradient(45deg, #881337 0px, #881337 2px, #4c0519 2px, #4c0519 14px)";

function timeRows(): string[] {
  const rows: string[] = [];
  for (let t = toMinutes(GRID_START); t < toMinutes(GRID_END); t += STEP_MIN) {
    rows.push(toHHMM(t));
  }
  return rows;
}

/** ドラッグ中の選択範囲 */
type Selection = { date: string; anchorRow: number; hoverRow: number };

export function WeekSchedule({
  userName,
  therapists,
  initialTherapistIds,
}: {
  userName: string;
  /** 絞り込みに出す施術者。担当候補になる人だけが渡ってくる（lib/therapists.ts） */
  therapists: SelectableTherapist[];
  /**
   * 最初に選んでおく施術者。紹介画面（/therapists）から「この施術者で予約する」で来たときに
   * その人だけが入ってくる。省略したら今までどおり全員を選んだ状態で始める。
   */
  initialTherapistIds?: string[];
}) {
  const [monday, setMonday] = useState(() => mondayOf(todayString()));
  // 絞り込みの条件はこれ 1 つ（Issue #9）。性別のチェックは「そのグループをまとめて ON/OFF」する操作で、
  // 条件そのものは持たない。こうしないと性別と施術者で同じことを二重に管理することになる。
  const [therapistIds, setTherapistIds] = useState<string[]>(() =>
    // 並び順は常に `therapists` に揃える（applyTherapistFilter と同じ考え方）
    initialTherapistIds && initialTherapistIds.length > 0
      ? therapists.filter((t) => initialTherapistIds.includes(t.id)).map((t) => t.id)
      : therapists.map((t) => t.id),
  );
  const [availability, setAvailability] = useState<WeekAvailability>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragging, setDragging] = useState(false);
  const { message, showMessage, clearMessage } = useFlashMessage();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState("");
  const [loading, startLoading] = useTransition();
  const [saving, setSaving] = useState(false);
  // 「今」を状態として持つ。画面を開いたままにしていても、時間が過ぎた枠が
  // そのまま選べる状態で残らないように 1 分ごとに進める
  // 最初は null にしてマウント後に入れる。サーバー描画時の時刻とクライアントの時刻が
  // 分の境界をまたぐと表示が食い違う（ハイドレーション不一致）ため。
  // 最初の描画では空き枠自体がまだ無い（availability は空）ので、見た目には影響しない。
  const [now, setNow] = useState<Date | null>(null);
  // 今週すでに持っている自分の予約（AC-19、週1回まで）。null ならこの週はまだ選べる
  const [weekBooking, setWeekBooking] = useState<WeekBooking | null>(null);
  const weekLocked = weekBooking !== null;
  // タッチ操作の端末かどうか。マウスの「ドラッグして選ぶ」は指では扱えない
  // （指でなぞっても、隣のマスへの mouseenter は発生せずページのスクロールになる）ため、
  // タッチ端末では「開始のマスをタップ→終了のマスをタップ」の 2 タップ方式に切り替える。
  // サーバー側では判定できないため、初期値は false にしてマウント後に判定する（ハイドレーション不一致を避ける）。
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // マウント直後にだけ同期的に設定する（`now` と同じ意図的な例外）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsTouchDevice(navigator.maxTouchPoints > 0 || "ontouchstart" in window);
  }, []);

  // 「あなたの予約」の縞模様（インラインスタイル）をライト/ダークどちらで塗るか。
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDarkMode(query.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // 表の幅の決め方を PC と狭い画面で分けるための判定（Tailwind の sm と同じ 640px 境界）。
  // 狭い画面だけ「列の合計とぴったり同じ幅」にして Safari の空欄を避け、
  // PC では今までどおり幅いっぱいに伸ばす（伸ばした分は自動で列に配られる。ここは PC の
  // ブラウザでは問題が出ていないため、狭い画面のときだけ挙動を変える）。
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsNarrowViewport(query.matches);
    const onChange = (e: MediaQueryListEvent) => setIsNarrowViewport(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const days = useMemo(() => weekdaysFrom(monday), [monday]);
  const rows = useMemo(() => timeRows(), []);
  const today = todayString();
  const therapistsKey = therapistIds.join(",");

  /** 性別ごとの施術者グループ。「男性」の枠の中に男性の施術者を並べる（Issue #9） */
  const groups = useMemo(() => {
    const byGender = GENDERS.map((gender) => ({
      key: gender as string,
      label: GENDER_LABEL[gender],
      members: therapists.filter((t) => t.gender === gender),
    }));
    // 想定外の性別値が入っていても、その人がチェックボックスから消えてしまわないよう受け皿を置く
    const others = therapists.filter((t) => !isGender(t.gender));
    return [...byGender, { key: "other", label: "その他", members: others }].filter(
      (g) => g.members.length > 0,
    );
  }, [therapists]);

  /**
   * 紹介画面から特定の施術者を指定して来たときに、その人だけに絞られていると画面で知らせるための名前。
   * 利用者が自分でチェックを足したり外したりしたら、指定どおりではなくなるので消える。
   * 施術者がその 1 人しかいない場合は「絞り込んでいる」ことに意味がないので出さない。
   */
  const focusedNames = useMemo(() => {
    if (!initialTherapistIds || initialTherapistIds.length === 0) return null;
    if (therapists.length <= initialTherapistIds.length) return null;
    const stillFocused =
      therapistIds.length === initialTherapistIds.length &&
      initialTherapistIds.every((id) => therapistIds.includes(id));
    if (!stillFocused) return null;
    return therapists.filter((t) => initialTherapistIds.includes(t.id)).map((t) => t.name);
  }, [initialTherapistIds, therapistIds, therapists]);

  const reload = useCallback(async () => {
    const [nextAvailability, booking] = await Promise.all([
      fetchWeekAvailability(monday, therapistIds),
      getBookedReservationInWeek(monday),
    ]);
    setAvailability(nextAvailability);
    setWeekBooking(booking);
    // therapistsKey で依存を表す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday, therapistsKey]);

  useEffect(() => {
    startLoading(async () => {
      const [nextAvailability, booking] = await Promise.all([
        fetchWeekAvailability(monday, therapistIds),
        getBookedReservationInWeek(monday),
      ]);
      setAvailability(nextAvailability);
      setWeekBooking(booking);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday, therapistsKey]);

  // 「自分の予約」（トップ画面）側でのキャンセルなど、他コンポーネントでの変更をこの週表示にも反映する
  useEffect(() => {
    const onUpdated = () => {
      reload();
    };
    window.addEventListener(RESERVATION_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(RESERVATION_UPDATED_EVENT, onUpdated);
  }, [reload]);

  /** その日・その時刻から 15 分の施術を始められるか（＝マスが空き色になる条件） */
  function isCellOpen(date: string, time: string): boolean {
    if (weekLocked) return false; // この週はすでに予約がある（AC-19、週1回まで）
    if (isPast(date)) return false;
    // 今日の過ぎた時間（15:00 を過ぎてからの 9:00 など）は選ばせない。
    // サーバー側でも同じ判定をしているが、開いたままの画面が古くなる分はここで止める
    if (now !== null && isStartPassed(date, time, now)) return false;
    return Boolean(availability[date]?.[15]?.[time]);
  }

  /** このマスが、今週すでに持っている自分の予約の時間帯かどうか */
  function isMyBookedCell(date: string, time: string): boolean {
    if (!weekBooking || weekBooking.date !== date) return false;
    return time >= weekBooking.startTime && time < weekBooking.endTime;
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

  // マウント直後に「今」を入れ、その後 1 分ごとに進める。
  // ちょうど始まる時刻をまたいだ枠が、選べたまま残らないようにする。
  useEffect(() => {
    // サーバー描画時刻とクライアントの時刻がずれてハイドレーション不一致になるのを避けるため、
    // マウント直後にだけ同期的に設定する（意図的な例外）。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  /**
   * タッチ端末用。「開始のマスをタップ→終了のマスをタップ」の 2 タップで選ぶ。
   * 同じ日をタップし直した場合は終了マスの指定として扱い、別の日（または未選択）をタップした場合は
   * そこを新しい開始マスにする。やり直したいときは既存の「取り消す」ボタンで一度リセットしてもらう。
   */
  function handleCellTap(date: string, rowIndex: number) {
    if (saving || loading) return;
    if (selection && selection.date === date) {
      setSelection({ ...selection, hoverRow: rowIndex });
      return;
    }
    if (!isCellOpen(date, rows[rowIndex])) return;
    clearMessage();
    setSelection({ date, anchorRow: rowIndex, hoverRow: rowIndex });
  }

  /**
   * 絞り込みを更新する。並び順は `therapists` の順に揃える。
   * 順番がチェックした順に変わると、中身が同じでも別の条件として読み込み直してしまうため。
   */
  function applyTherapistFilter(next: Set<string>) {
    setSelection(null);
    setTherapistIds(therapists.filter((t) => next.has(t.id)).map((t) => t.id));
  }

  function toggleTherapist(id: string) {
    const next = new Set(therapistIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    applyTherapistFilter(next);
  }

  /** 性別のチェック = そのグループの施術者をまとめて ON / OFF する */
  function toggleGroup(members: SelectableTherapist[]) {
    const allSelected = members.every((m) => therapistIds.includes(m.id));
    const next = new Set(therapistIds);
    for (const m of members) {
      if (allSelected) next.delete(m.id);
      else next.add(m.id);
    }
    applyTherapistFilter(next);
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
          {groups.length === 0 ? (
            <p className="py-2 text-black/60 dark:text-white/60">
              受付中の施術者がいません。管理者に確認してください。
            </p>
          ) : (
            <div className="flex flex-wrap gap-3 py-2">
              {groups.map((group) => {
                const selectedCount = group.members.filter((m) =>
                  therapistIds.includes(m.id),
                ).length;
                const allSelected = selectedCount === group.members.length;

                return (
                  <div
                    key={group.key}
                    className="rounded-xl border border-rose-200 px-3 py-2 dark:border-rose-500/30"
                  >
                    <label className="flex cursor-pointer items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        // 「一部だけ選択中」は checked では表せないため、DOM の indeterminate を直接立てる
                        ref={(el) => {
                          if (el) el.indeterminate = selectedCount > 0 && !allSelected;
                        }}
                        onChange={() => toggleGroup(group.members)}
                        className="size-4 accent-rose-500"
                      />
                      <span>{group.label}</span>
                      <span className="text-xs font-normal tabular-nums text-black/50 dark:text-white/50">
                        {selectedCount} / {group.members.length}
                      </span>
                    </label>
                    {/* 施術者は横に並べる。人数が増えたら折り返す */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rose-100 pt-1.5 pl-6 dark:border-rose-500/20">
                      {group.members.map((t) => (
                        <label key={t.id} className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={therapistIds.includes(t.id)}
                            onChange={() => toggleTherapist(t.id)}
                            className="size-4 accent-rose-500"
                          />
                          <span>{t.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </fieldset>
      </div>

      {focusedNames && focusedNames.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <span>
            <strong>{focusedNames.join("・")}</strong>
            さんの空き枠だけを表示しています。
          </span>
          <button
            type="button"
            onClick={() => applyTherapistFilter(new Set(therapists.map((t) => t.id)))}
            className="underline underline-offset-2 hover:no-underline"
          >
            全員の空き枠を見る
          </button>
        </p>
      )}

      <p className="text-sm text-black/70 dark:text-white/70">
        {isTouchDevice ? (
          <strong>開始のマスをタップし、続けて終了のマスをタップして施術時間を選びます。</strong>
        ) : (
          <strong>表を縦にドラッグして施術時間を選びます。</strong>
        )}
        1 マス = 15 分、最大 3 マス（45 分）まで。
        チェックした施術者のうち空いている人と、ベッドが自動で割り当てられます。
      </p>

      {groups.length > 0 && therapistIds.length === 0 && (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          施術者が 1 人も選ばれていないため、空き枠は表示されません。
          上の「施術者」で 1 人以上チェックしてください。
        </p>
      )}

      {weekLocked && (
        <p className="rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-800 dark:text-red-300">
          この週はすでに予約があるため、新しく選べません（1週間に1回まで）。
          キャンセルすれば、この週にもう一度予約できます。
        </p>
      )}

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
                  {selected.slot.bedName} / {selected.slot.therapistName}
                  {isGender(selected.slot.gender) && `（${GENDER_LABEL[selected.slot.gender]}）`}
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
        {weekLocked && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block size-3 rounded-sm"
              style={{ backgroundImage: isDarkMode ? MY_BOOKED_STRIPE_DARK : MY_BOOKED_STRIPE_LIGHT }}
            />
            あなたの予約
          </span>
        )}
      </div>

      {/*
        狭い画面では曜日の列が入り切らないので横スクロールさせる。
        そのとき時刻列も一緒に流れると「今どの行を見ているか」が分からなくなるため、
        管理者の予約状況画面と同じく時刻列だけ sticky left-0 で左端に貼り付ける。
        sticky + border-collapse は狭い画面で罫線がずれる（枠線が表側に属し、固定した
        セルと一緒に動かない）ため、狭い画面だけ border-separate に切り替える。

        表と列の幅（width / table-layout）は、Tailwind のクラスではなく style 属性で
        直接指定している。当初は狭い画面でも PC と同じ「幅は 100%、ただし最低 640px」
        （min-width）にしていたが、列の合計（時刻 4rem + 日付 6.5rem × 5 列 = 36.5rem）より
        広い分を表が自動で列に配り直す前提のところ、実機の Safari ではこの「配り直し」が
        効かず、余った分がそのまま右側の空欄になった（Tailwind のクラスに戻しても、
        min-width だけにしても、table-fixed にしても再現した）。

        直し方は、狭い画面だけ表の幅を「配り直しが必要な余りが出ない値」＝列の合計と
        ぴったり同じ値にすること（`isNarrowViewport`）。PC では今までどおり幅いっぱいに
        伸ばす（＝ 100%）。PC のブラウザでは配り直し自体に問題が出ていないため、
        表を画面幅いっぱいに大きく見せる従来の見た目を PC では維持できる。
      */}
      <div className="overflow-x-auto">
        <table
          style={{
            width: isNarrowViewport ? `${TIME_COL_REM + DAY_COL_REM * days.length}rem` : "100%",
            tableLayout: "fixed",
          }}
          className="border-collapse select-none text-sm max-sm:border-separate max-sm:border-spacing-0 max-sm:border-t max-sm:border-l max-sm:border-black/10 max-sm:dark:border-white/15"
        >
          <thead>
            <tr>
              <th
                style={{ width: `${TIME_COL_REM}rem` }}
                className="sticky left-0 z-10 border border-black/10 bg-background px-2 py-2 text-left shadow-[1px_0_0_var(--chart-grid)] dark:border-white/15 max-sm:border-t-0 max-sm:border-l-0"
              >
                時刻
              </th>
              {days.map((date) => (
                <th
                  key={date}
                  style={{ width: `${DAY_COL_REM}rem` }}
                  className={`border border-black/10 px-2 py-2 text-center dark:border-white/15 max-sm:border-t-0 max-sm:border-l-0 ${
                    date === today ? "border-b-2 border-b-rose-500" : ""
                  }`}
                >
                  {formatShort(date)}
                  {date === today && (
                    <span className="ml-1 inline-block whitespace-nowrap rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-normal text-white dark:bg-rose-400 dark:text-rose-950">
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
                <th className="sticky left-0 z-10 border border-black/10 bg-background px-2 py-1 text-left font-normal tabular-nums shadow-[1px_0_0_var(--chart-grid)] dark:border-white/15 max-sm:border-t-0 max-sm:border-l-0">
                  {time.endsWith(":00") ? time : ""}
                </th>
                {days.map((date) => {
                  const open = isCellOpen(date, time);
                  const passed = isPast(date) || (now !== null && isStartPassed(date, time, now));
                  const inSelection = isInSelection(date, rowIndex);
                  const selectionValid = selected?.valid ?? true;
                  const myBooked = isMyBookedCell(date, time);

                  let tone = "bg-black/15 dark:bg-white/25"; // 空きなし
                  let stripeStyle: React.CSSProperties | undefined;
                  if (inSelection) {
                    tone = selectionValid
                      ? "bg-rose-500"
                      : "bg-red-500/45";
                  } else if (open) {
                    tone = "bg-rose-100 hover:bg-rose-200 dark:bg-rose-400/20 dark:hover:bg-rose-400/35";
                  } else if (myBooked) {
                    // Tailwind の bg-[...] だと縞模様が Safari で真っ白になるため、
                    // ここだけ圧縮されないインラインスタイルで塗る（MY_BOOKED_STRIPE_* 参照）。
                    tone = "";
                    stripeStyle = { backgroundImage: isDarkMode ? MY_BOOKED_STRIPE_DARK : MY_BOOKED_STRIPE_LIGHT };
                  }

                  return (
                    <td
                      key={date}
                      onMouseDown={() => {
                        if (!isTouchDevice) startDrag(date, rowIndex);
                      }}
                      onMouseEnter={() => {
                        if (!isTouchDevice) extendDrag(date, rowIndex);
                      }}
                      onClick={() => {
                        if (isTouchDevice) handleCellTap(date, rowIndex);
                      }}
                      title={
                        open
                          ? `${formatShort(date)} ${time} から。ドラッグで長さを変えられます`
                          : myBooked
                            ? "あなたの予約の時間です"
                            : passed
                              ? "過ぎた時間です"
                              : "空きがありません"
                      }
                      style={stripeStyle}
                      className={`h-7 border border-black/10 p-0 max-sm:border-t-0 max-sm:border-l-0 dark:border-white/15 ${tone} ${
                        open ? "cursor-pointer" : "cursor-not-allowed"
                      }`}
                    >
                      <span className="sr-only">
                        {formatShort(date)} {time}{" "}
                        {open ? "空き" : myBooked ? "あなたの予約" : passed ? "過ぎた時間" : "空きなし"}
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
