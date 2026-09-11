import { listMyAssignments } from "@/app/actions/therapist";
import { TodayAssignments } from "./TodayAssignments";

/** 本日の予約（AC-15）。マッサージ師が自分の担当予約を確認する画面。 */
export default async function TherapistTodayPage() {
  const data = await listMyAssignments();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">自分の担当する予約</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">今日もよろしくお願いします。</p>
      </div>
      <TodayAssignments initialData={data} />
    </div>
  );
}
