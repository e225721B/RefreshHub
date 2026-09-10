"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  listShiftOverview,
  type ShiftOverview as ShiftOverviewData,
  type TherapistOption,
} from "@/app/actions/therapist";
import { formatShort, formatWeekLabel, mondayOf, shiftWeek, todayString, weekdaysFrom } from "@/lib/dates";
import { toMinutes } from "@/lib/slots";
import { ReservationDetailModal } from "./today/ReservationDetailModal";

const GRID_START_MIN = 9 * 60;
const GRID_END_MIN = 20 * 60;
const PX_PER_MIN = 0.9;
const BODY_HEIGHT = (GRID_END_MIN - GRID_START_MIN) * PX_PER_MIN;
const HOURS = Array.from({ length: 12 }, (_, i) => 9 + i);
const QUARTER_MARKS = Array.from(
  { length: (GRID_END_MIN - GRID_START_MIN) / 15 + 1 },
  (_, i) => GRID_START_MIN + i * 15,
);

function pxFor(minutes: number): number {
  const clamped = Math.min(Math.max(minutes, GRID_START_MIN), GRID_END_MIN);
  return (clamped - GRID_START_MIN) * PX_PER_MIN;
}

/** 勤務可能時間帯(windows)の隙間 = 休憩・欠勤・勤務外などで表示されていない時間帯。グレーのマスクで表す */
function unavailableRanges(windows: { startTime: string; endTime: string }[]): { start: number; end: number }[] {
  const sorted = windows
    .map((w) => ({ start: toMinutes(w.startTime), end: toMinutes(w.endTime) }))
    .sort((a, b) => a.start - b.start);
  const gaps: { start: number; end: number }[] = [];
  let cursor = GRID_START_MIN;
  for (const w of sorted) {
    if (w.start > cursor) gaps.push({ start: cursor, end: w.start });
    cursor = Math.max(cursor, w.end);
  }
  if (cursor < GRID_END_MIN) gaps.push({ start: cursor, end: GRID_END_MIN });
  return gaps;
}

/** その日付のうち「もう過ぎた」時刻(分)。過去日は丸ごと、今日は現在時刻まで、未来日は無し（=GRID_START_MIN） */
function pastCutoffFor(date: string): number {
  const today = todayString();
  if (date < today) return GRID_END_MIN;
  if (date > today) return GRID_START_MIN;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** range を [lo, hi] の範囲に切り詰める。重なりが無ければ null */
function clampRange(range: { start: number; end: number }, lo: number, hi: number): { start: number; end: number } | null {
  const start = Math.max(range.start, lo);
  const end = Math.min(range.end, hi);
  return end > start ? { start, end } : null;
}

export function ShiftOverviewGrid({
  therapists,
  initialMonday,
  initialOverview,
}: {
  therapists: TherapistOption[];
  initialMonday: string;
  initialOverview: ShiftOverviewData;
}) {
  const [monday, setMonday] = useState(initialMonday);
  const [showAll, setShowAll] = useState(false);
  const [overview, setOverview] = useState<ShiftOverviewData>(initialOverview);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  const days = weekdaysFrom(monday);
  const today = todayString();

  const ownIds = therapists.filter((t) => t.isSelf).map((t) => t.id);
  const fallbackIds = ownIds.length > 0 ? ownIds : therapists.slice(0, 1).map((t) => t.id);
  const otherIds = therapists.filter((t) => !t.isSelf).map((t) => t.id);
  // 自分の列を常に一番左に固定する
  const selected = showAll ? [...ownIds, ...otherIds] : fallbackIds;

  const isFirstRender = useRef(true);
  useEffect(() => {
    // 初回マウント時は initialOverview（サーバーで取得済み）をそのまま使うのでスキップする。
    // それ以降は monday / showAll が変わるたびに必ず再取得する
    // （initialMonday と比較してスキップすると、他の週から戻ってきたときに
    //  古い週のデータが overview に残ったままになり、予約が消えたように見える）。
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    startLoading(async () => setOverview(await listShiftOverview(monday, selected)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday, showAll]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setMonday(shiftWeek(monday, -1))}
          className="rounded-full border border-black/15 px-3.5 py-1.5 text-sm dark:border-white/20"
        >
          ◁ 前週
        </button>
        <span className="min-w-32 text-center text-lg font-bold text-stone-800 dark:text-stone-100">
          {formatWeekLabel(monday)}
        </span>
        <button
          type="button"
          onClick={() => setMonday(shiftWeek(monday, 1))}
          className="rounded-full border border-black/15 px-3.5 py-1.5 text-sm dark:border-white/20"
        >
          翌週 ▷
        </button>
        <button
          type="button"
          onClick={() => setMonday(mondayOf(todayString()))}
          className="rounded-full border border-black/15 px-3.5 py-1.5 text-sm dark:border-white/20"
        >
          今週
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">
        <span className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
          <span className="inline-block size-3 rounded-sm bg-rose-600" />
          自分の予約
        </span>
        {showAll && (
          <span className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            <span className="inline-block size-3 rounded-sm bg-orange-300" />
            他の施術者の予約
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
          <span className="inline-block size-3 rounded-sm bg-black/10 dark:bg-white/15" />
          休憩・勤務外
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400">表示</span>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={showAll}
              onChange={() => setShowAll((v) => !v)}
              className="size-4"
            />
            全員
          </label>
        </div>
      </div>

      <p className="text-xs text-stone-500 dark:text-stone-400">
        シフトをクリックすると詳細が見られます。詳細は自分のシフトのみ確認できます。
      </p>

      {selected.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/15 px-4 py-6 text-center text-sm text-stone-400 dark:border-white/20">
          表示する人を選んでください
        </p>
      ) : (
        <div className="flex gap-2">
          <div className="w-12 shrink-0">
            <div className="h-8" />
            <div className="relative" style={{ height: BODY_HEIGHT }}>
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute -translate-y-1/2 text-xs tabular-nums text-stone-400"
                  style={{ top: pxFor(h * 60) }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-5 gap-2">
            {days.map((date) => (
              <div key={date} className="flex flex-col">
                <div
                  className={`h-8 text-center text-sm font-medium ${
                    date === today ? "text-rose-600 dark:text-rose-300" : "text-stone-700 dark:text-stone-200"
                  }`}
                >
                  {formatShort(date)}
                  {date === today && <span className="ml-1 text-xs font-normal">今日</span>}
                </div>
                <div
                  className="relative overflow-hidden rounded-lg border border-black/10 bg-white dark:border-white/10 dark:bg-white/5"
                  style={{ height: BODY_HEIGHT }}
                >
                  {QUARTER_MARKS.map((m) => (
                    <div
                      key={m}
                      className={`absolute inset-x-0 border-t ${
                        m % 60 === 0 ? "border-black/10 dark:border-white/15" : "border-black/5 dark:border-white/10"
                      }`}
                      style={{ top: pxFor(m) }}
                    />
                  ))}
                  <div className="absolute inset-0 flex">
                    {selected.map((therapistId) => {
                      const info = overview[date]?.[therapistId];
                      const therapist = therapists.find((t) => t.id === therapistId);
                      const isSelf = therapist?.isSelf ?? false;
                      const label = isSelf ? "自分" : (therapist?.name ?? "");
                      const windows = info?.windows ?? [];
                      const pastCutoff = pastCutoffFor(date);
                      const pastRanges = windows
                        .map((w) => clampRange({ start: toMinutes(w.startTime), end: toMinutes(w.endTime) }, GRID_START_MIN, pastCutoff))
                        .filter((r): r is { start: number; end: number } => r !== null);
                      return (
                        <div
                          key={therapistId}
                          className="relative flex-1 border-l border-black/10 first:border-l-0 dark:border-white/15"
                        >
                          {unavailableRanges(windows).map((g, gi) => (
                            <div
                              key={gi}
                              className="absolute inset-x-0 bg-black/10 dark:bg-white/10"
                              style={{ top: pxFor(g.start), height: pxFor(g.end) - pxFor(g.start) }}
                            />
                          ))}
                          {info?.reservations.map((r, ri) => {
                            const style = {
                              top: pxFor(toMinutes(r.startTime)),
                              height: Math.max(pxFor(toMinutes(r.endTime)) - pxFor(toMinutes(r.startTime)), 14),
                            };
                            const className = `absolute left-0.5 w-[calc(100%_-_4px)] flex items-center justify-center overflow-hidden whitespace-nowrap rounded px-0.5 text-[10px] font-bold leading-tight [writing-mode:vertical-rl] [text-orientation:upright] ${
                              isSelf ? "bg-rose-600 text-white" : "bg-orange-300 text-orange-950"
                            }`;
                            const title = `${r.userName}（${label}・${r.bedName}）`;
                            return isSelf ? (
                              <button
                                key={ri}
                                type="button"
                                title={title}
                                onClick={() => setSelectedReservationId(r.id)}
                                className={`${className} cursor-pointer hover:brightness-110`}
                                style={style}
                              >
                                {label}
                              </button>
                            ) : (
                              <div key={ri} title={title} className={className} style={style}>
                                {label}
                              </div>
                            );
                          })}
                          {pastRanges.map((p, pi) => (
                            <div
                              key={pi}
                              className="pointer-events-none absolute inset-x-0 bg-black/15 dark:bg-white/15"
                              style={{ top: pxFor(p.start), height: pxFor(p.end) - pxFor(p.start) }}
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="text-center text-sm text-stone-400">読み込み中…</p>}

      {selectedReservationId && (
        <ReservationDetailModal id={selectedReservationId} onClose={() => setSelectedReservationId(null)} />
      )}
    </div>
  );
}
