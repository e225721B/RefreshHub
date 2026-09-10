"use client";

import { useState } from "react";
import type { AssignmentRow, MyAssignments } from "@/app/actions/therapist";
import { formatShort } from "@/lib/dates";
import { ReservationDetailModal } from "./ReservationDetailModal";

function AssignmentsTable({
  title,
  count,
  totalTreatmentMin,
  rows,
  emptyText,
  onSelect,
}: {
  title: string;
  count: number;
  totalTreatmentMin: number;
  rows: AssignmentRow[];
  emptyText: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white/80 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
        <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">{title}</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {count} 件 / 施術合計 {totalTreatmentMin} 分
        </p>
      </div>

      <div className="overflow-x-auto pb-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-black/10 bg-rose-50/60 text-left text-rose-700/80 dark:border-white/10 dark:bg-rose-500/10 dark:text-rose-200/80">
              <th className="px-4 py-3 font-medium">日程</th>
              <th className="px-4 py-3 font-medium">施術時間</th>
              <th className="px-4 py-3 font-medium">利用者</th>
              <th className="px-4 py-3 font-medium">ベッド</th>
              <th className="px-4 py-3 font-medium">詳細</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-stone-400">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-4 py-3 tabular-nums">
                    {formatShort(row.date)} {row.startTime}
                  </td>
                  <td className="px-4 py-3">{row.treatmentMin} 分</td>
                  <td className="px-4 py-3">{row.userName}</td>
                  <td className="px-4 py-3">{row.bedName}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSelect(row.id)}
                      className="text-sm text-rose-600 underline underline-offset-2 dark:text-rose-300"
                    >
                      詳細
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TodayAssignments({ initialData }: { initialData: MyAssignments }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const data = initialData;

  if (!data.isTherapist) {
    return (
      <p className="rounded-2xl border border-black/10 bg-white/70 px-5 py-4 text-sm text-stone-600 dark:border-white/10 dark:bg-white/5 dark:text-stone-300">
        このアカウントにはマッサージ師の登録がありません。
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {data.today.summary.nextIn !== null && (
        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-5 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
          次の施術まで {data.today.summary.nextIn} 分
        </div>
      )}

      <AssignmentsTable
        title="今日の予約"
        count={data.today.summary.count}
        totalTreatmentMin={data.today.summary.totalTreatmentMin}
        rows={data.today.rows}
        emptyText="本日の予約はありません"
        onSelect={setSelectedId}
      />

      <AssignmentsTable
        title="明日以降の予約"
        count={data.upcoming.summary.count}
        totalTreatmentMin={data.upcoming.summary.totalTreatmentMin}
        rows={data.upcoming.rows}
        emptyText="今後の予約はありません"
        onSelect={setSelectedId}
      />

      {selectedId && <ReservationDetailModal id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
