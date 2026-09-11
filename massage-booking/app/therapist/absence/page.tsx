import { listMyAbsenceRequests } from "@/app/actions/therapist";
import { AbsenceRequestForm } from "./AbsenceRequestForm";

/**
 * 休み申請（T-5）。マッサージ師が休みたい日を申請する画面。
 * 承認・自動キャンセルは今回のスコープ外。申請の送信と履歴表示までを実装する。
 */
export default async function TherapistAbsencePage() {
  const history = await listMyAbsenceRequests();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">休み申請</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          登録済みのシフトを取り下げます。その時間に予約が入っている場合は、管理者が調整します。
        </p>
      </div>
      <AbsenceRequestForm initialHistory={history} />
    </div>
  );
}
