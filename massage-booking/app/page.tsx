import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserForRequest } from "@/lib/session";
import { listSelectableTherapists } from "@/lib/therapists";
import { MyUpcomingReservations } from "./MyUpcomingReservations";
import { TopNav } from "./TopNav";
import { WeekSchedule } from "./WeekSchedule";

export default async function Home({
  searchParams,
}: {
  // Next.js 16 では searchParams は Promise。await が必要。
  searchParams: Promise<{ denied?: string }>;
}) {
  // 未ログインならログイン画面へ。戻り先を渡し、ログイン後にここへ戻す。
  const user = await getCurrentUserForRequest();
  if (!user) redirect("/login?next=%2F");
  const { denied } = await searchParams;
  // 絞り込みチェックボックスの選択肢（Issue #9）。
  // 画面が開いた時点で確定しているのでサーバー側で読み、クライアントからの取得往復を作らない
  const therapists = await listSelectableTherapists();

  return (
    <>
      <TopNav user={user} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <MyUpcomingReservations />

        <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">マッサージ室の予約</h1>
            <p className="mt-1 text-sm text-rose-600/80 dark:text-rose-300/80">
              空いた時間に、ひと息つきに行こう。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {(user.role === "therapist" || user.role === "admin") && (
              <Link href="/therapist" className="text-sm underline underline-offset-4">
                マッサージ師向け: 自分の予約を見る
              </Link>
            )}
            {user.role === "admin" && (
              <Link href="/admin" className="text-sm underline underline-offset-4">
                管理者向け: 予約状況を見る
              </Link>
            )}
          </div>
        </header>

        {denied === "admin" && (
          <p className="mb-6 rounded border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-800 dark:text-red-300">
            予約状況の画面は管理者だけが開けます。
          </p>
        )}

        <WeekSchedule userName={user.name} therapists={therapists} />
      </main>
    </>
  );
}
