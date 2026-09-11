import { listMyAbsences } from "@/app/actions/therapist";
import { AbsenceForm } from "./AbsenceForm";

/**
 * 休みの登録（T-5）。マッサージ師が休みたい日を自分で登録する画面。
 * その時間帯に予約が 1 件も無ければ、管理者の承認なしにそのまま休みになる（app/actions/therapist.ts の registerAbsence）。
 * 登録・取消のたびに、管理者のメールボックスへその旨だけ通知される。
 */
export default async function TherapistAbsencePage() {
  const history = await listMyAbsences();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">休みの登録</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          予約が入っていない時間帯だけ、そのまま休みにできます。
        </p>
      </div>
      <AbsenceForm initialHistory={history} />
    </div>
  );
}
