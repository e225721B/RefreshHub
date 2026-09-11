import { redirect } from "next/navigation";
import { getCurrentUserForRequest } from "@/lib/session";
import { listSelectableTherapists } from "@/lib/therapists";
import { TopNav } from "../TopNav";
import { WeekSchedule } from "../WeekSchedule";

export default async function BookingPage() {
  // 未ログインならログイン画面へ。戻り先を渡し、ログイン後にここへ戻す。
  const user = await getCurrentUserForRequest();
  if (!user) redirect("/login?next=%2Fbooking");
  // 絞り込みチェックボックスの選択肢（Issue #9）。
  // 画面が開いた時点で確定しているのでサーバー側で読み、クライアントからの取得往復を作らない
  const therapists = await listSelectableTherapists();

  return (
    <>
      <TopNav user={user} />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:w-auto sm:px-6 sm:py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold">マッサージ室の予約</h1>
          <p className="mt-1 text-sm text-rose-600/80 dark:text-rose-300/80">
            空いているマスを選んで、そのまま予約できます。
          </p>
        </header>

        <WeekSchedule userName={user.name} therapists={therapists} />
      </main>
    </>
  );
}
