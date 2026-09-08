import Link from "next/link";
import { WeekSchedule } from "./WeekSchedule";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">マッサージ室の予約</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            空いているマスを選ぶだけ。ベッドと施術者は自動で割り当てます。
          </p>
        </div>
        <Link href="/admin" className="text-sm underline underline-offset-4">
          管理者向け: 予約状況を見る
        </Link>
      </header>
      <WeekSchedule />
    </main>
  );
}
