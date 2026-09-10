import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, nextCookieJar } from "@/lib/session";
import { MyUpcomingReservations } from "./MyUpcomingReservations";
import { QuickBooking } from "./QuickBooking";
import { TopNav } from "./TopNav";

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
      <TopNav user={user} />
      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        {denied === "admin" && (
          <p className="rounded border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-800 dark:text-red-300">
            予約状況の画面は管理者だけが開けます。
          </p>
        )}

        <MyUpcomingReservations />

        <section className="overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-100 via-rose-50 to-orange-50 dark:border-rose-500/20 dark:from-rose-950/40 dark:via-rose-950/20 dark:to-orange-950/20">
          <div className="grid gap-8 p-8 sm:grid-cols-[1.3fr_1fr] sm:items-center sm:p-12">
            <div>
              <p className="mb-3 text-sm font-semibold text-rose-600 dark:text-rose-300">
                15 分から受けられます
              </p>
              <h1 className="text-3xl leading-tight font-bold sm:text-4xl">
                空いた時間に、
                <br />
                ひと息つきに行こう。
              </h1>
              <p className="mt-4 text-sm text-black/70 sm:text-base dark:text-white/70">
                会議のあいだの 15 分でも大丈夫。ベッドと施術者は自動で割り当てるので、
                時間を選ぶだけで予約が終わります。
              </p>
            </div>
            <div className="relative aspect-4/3 overflow-hidden rounded-2xl border border-rose-200/60 dark:border-rose-400/20">
              {/* フリー素材の仮写真（Picsum Photos）。本物の施術風景に差し替え予定 */}
              <Image
                src="https://picsum.photos/seed/refreshhub-massage/800/600"
                alt="マッサージ室のイメージ写真"
                fill
                sizes="(min-width: 640px) 40vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50 to-orange-50 p-4 dark:border-rose-500/20 dark:from-rose-950/30 dark:to-orange-950/20 sm:p-6">
          <QuickBooking userName={user.name} />
        </section>

        <section className="rounded-3xl border border-rose-100 bg-gradient-to-r from-rose-50 to-orange-50 p-6 dark:border-rose-500/20 dark:from-rose-950/30 dark:to-orange-950/20 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">担当するのはこんな人たちです</h2>
              <p className="mt-1 text-sm text-black/70 dark:text-white/70">
                得意な施術や雰囲気を見てから選べます。
              </p>
            </div>
            <Link
              href="/therapists"
              className="shrink-0 rounded-full border border-rose-300 bg-white px-5 py-2.5 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50 dark:border-rose-400/40 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              マッサージ師を見る
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
