"use client";

import { useState } from "react";
import type { AssignmentRow, MyAssignments } from "@/app/actions/therapist";
import { formatShort } from "@/lib/dates";
import { ReservationDetailModal } from "./ReservationDetailModal";
import { UserHistoryModal } from "./UserHistoryModal";

function AssignmentsTable({
  title,
  count,
  rows,
  emptyText,
  onSelect,
  onSelectUser,
}: {
  title: string;
  count: number;
  rows: AssignmentRow[];
  emptyText: string;
  onSelect: (id: string) => void;
  onSelectUser: (userId: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">{title}</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">{count} 件</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm sm:min-w-[640px]">
          <thead>
            <tr className="bg-rose-50/60 text-left text-rose-700/80 dark:bg-rose-500/10 dark:text-rose-200/80">
              <th className="border-b border-black/10 px-3 py-3 font-medium sm:px-4 dark:border-white/10">日程</th>
              <th className="hidden border-b border-black/10 px-4 py-3 font-medium sm:table-cell dark:border-white/10">
                施術時間
              </th>
              <th className="border-b border-black/10 px-3 py-3 font-medium sm:px-4 dark:border-white/10">利用者</th>
              <th className="hidden border-b border-black/10 px-4 py-3 font-medium sm:table-cell dark:border-white/10">
                ベッド
              </th>
              <th className="border-b border-black/10 px-3 py-3 font-medium sm:px-4 dark:border-white/10">詳細</th>
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
                  <td className="px-3 py-3 tabular-nums sm:px-4">
                    {formatShort(row.date)} {row.startTime}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">{row.treatmentMin} 分</td>
                  <td className="px-3 py-3 sm:px-4">
                    <button
                      type="button"
                      onClick={() => onSelectUser(row.userId)}
                      className="text-rose-600 hover:underline dark:text-rose-300"
                    >
                      {row.userName}
                    </button>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">{row.bedName}</td>
                  <td className="px-3 py-3 sm:px-4">
                    <button
                      type="button"
                      onClick={() => onSelect(row.id)}
                      className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
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
      <AssignmentsTable
        title="今日の予約"
        count={data.today.summary.count}
        rows={data.today.rows}
        emptyText="本日の予約はありません"
        onSelect={setSelectedId}
        onSelectUser={setSelectedUserId}
      />

      <AssignmentsTable
        title="明日以降の予約"
        count={data.upcoming.summary.count}
        rows={data.upcoming.rows}
        emptyText="今後の予約はありません"
        onSelect={setSelectedId}
        onSelectUser={setSelectedUserId}
      />

      {selectedId && <ReservationDetailModal id={selectedId} onClose={() => setSelectedId(null)} />}
      {selectedUserId && <UserHistoryModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />}
    </div>
  );
}
