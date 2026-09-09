import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, nextCookieJar } from "@/lib/session";
import { TopNav } from "./TopNav";
import { WeekSchedule } from "./WeekSchedule";

export default async function Home({
  searchParams,
}: {
  // Next.js 16 では searchParams は Promise。await が必要。
  searchParams: Promise<{ denied?: string }>;
}) {
  // 未ログインならログイン画面へ。戻り先を渡し、ログイン後にここへ戻す。
  const user = await getCurrentUser(await nextCookieJar());
  if (!user) redirect("/login?next=%2F");
  const { denied } = await searchParams;

  return (
    <>
      <TopNav user={user} active="booking" />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">マッサージ室の予約</h1>
            <p className="mt-1 text-sm text-rose-600/80 dark:text-rose-300/80">
              空いた時間に、ひと息つきに行こう。
            </p>
          </div>
          {user.role === "admin" && (
            <Link href="/admin" className="text-sm underline underline-offset-4">
              管理者向け: 予約状況を見る
            </Link>
          )}
        </header>

        {denied === "admin" && (
          <p className="mb-6 rounded border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-800 dark:text-red-300">
            予約状況の画面は管理者だけが開けます。
          </p>
        )}

        <WeekSchedule />
      </main>
    </>
  );
}
