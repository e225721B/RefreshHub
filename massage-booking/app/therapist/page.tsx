import { listActiveTherapists, listShiftOverview } from "@/app/actions/therapist";
import { mondayOf, todayString } from "@/lib/dates";
import { ShiftOverviewGrid } from "./ShiftOverviewGrid";

/**
 * シフト一覧（読み取り専用）。
 * モックアップの「自分のシフト」から名前と役割を変更したもの:
 * 自分だけでなく、チェックボックスで選んだマッサージ師のシフト・予約もあわせて見られる。
 * シフト自体の登録・変更はここでは行わない（design.md の決定どおり管理者のみ）。
 */
export default async function TherapistShiftsPage() {
  const therapists = await listActiveTherapists();
  const monday = mondayOf(todayString());
  const self = therapists.filter((t) => t.isSelf).map((t) => t.id);
  const initialSelected = self.length > 0 ? self : therapists.slice(0, 1).map((t) => t.id);
  const overview = await listShiftOverview(monday, initialSelected);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">シフト一覧</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          あけた時間が、誰かのひと息になります。
        </p>
      </div>
      <ShiftOverviewGrid therapists={therapists} initialMonday={monday} initialOverview={overview} />
    </div>
  );
}
