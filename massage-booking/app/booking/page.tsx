import { redirect } from "next/navigation";
import { getCurrentUser, nextCookieJar } from "@/lib/session";
import { TopNav } from "../TopNav";
import { WeekSchedule } from "../WeekSchedule";

export default async function BookingPage() {
  // 未ログインならログイン画面へ。戻り先を渡し、ログイン後にここへ戻す。
  const user = await getCurrentUser(await nextCookieJar());
  if (!user) redirect("/login?next=%2Fbooking");

  return (
    <>
      <TopNav user={user} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold">マッサージ室の予約</h1>
          <p className="mt-1 text-sm text-rose-600/80 dark:text-rose-300/80">
            空いているマスを選んで、そのまま予約できます。
          </p>
        </header>

        <WeekSchedule userName={user.name} />
      </main>
    </>
  );
}
