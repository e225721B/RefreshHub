import { redirect } from "next/navigation";
import { getCurrentUser, nextCookieJar } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "ログイン | マッサージ室の予約",
  description: "社内マッサージ室の予約システムにログインします",
};

/** カードの下に並べる、このサービスでできること */
const POINTS = [
  {
    title: "空きがひと目で",
    icon: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: "15 分から予約",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    title: "施術者を選べる",
    icon: (
      <>
        <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 19.5a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
];

export default async function LoginPage({
  searchParams,
}: {
  // Next.js 16 では searchParams は Promise。await が必要。
  searchParams: Promise<{ next?: string }>;
}) {
  // ログイン済みの人をログイン画面に留めない
  if (await getCurrentUser(await nextCookieJar())) redirect("/");

  const params = await searchParams;
  const next =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";

  return (
    <div className="relative isolate flex min-h-dvh w-full items-center justify-center overflow-hidden bg-gradient-to-br from-rose-100 via-orange-50 to-amber-50 px-6 py-12 dark:from-rose-950 dark:via-stone-950 dark:to-stone-950">
      {/* 背景のやわらかい光。装飾なので読み上げ対象から外す */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 -top-32 size-[28rem] rounded-full bg-rose-300/40 blur-3xl dark:bg-rose-500/15" />
        <div className="absolute -bottom-40 -right-24 size-[30rem] rounded-full bg-orange-200/50 blur-3xl dark:bg-orange-500/10" />
        <div className="absolute left-1/2 top-1/2 size-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-200/35 blur-3xl dark:bg-pink-500/10" />
      </div>

      <div className="w-full max-w-[26rem]">
        {/* ブランドと見出し */}
        <div className="flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/70 shadow-sm ring-1 ring-white/60 dark:bg-white/10 dark:ring-white/10">
            {/* 湯気の立つ器＝リラックスの記号 */}
            <svg className="size-7 text-rose-500 dark:text-rose-300" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12h13a4 4 0 0 1 0 8H8a4 4 0 0 1-4-4v-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M17 13h1.5a2.5 2.5 0 0 1 0 5H17" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 8.5c0-1.2 1.2-1.4 1.2-2.6M12 8.5c0-1.2 1.2-1.4 1.2-2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>

          <span className="mt-4 text-lg font-semibold tracking-tight text-stone-800 dark:text-stone-100">
            RefreshHub
          </span>
          <span className="mt-2 inline-flex items-center rounded-full bg-white/60 px-3.5 py-1.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200/70 dark:bg-white/10 dark:text-rose-200 dark:ring-white/10">
            社内マッサージ室 予約システム
          </span>

          <h1 className="mt-6 text-[2rem] font-bold leading-[1.3] tracking-tight text-stone-800 dark:text-stone-50">
            空いた時間に、
            <br />
            ひと息つきに行こう。
          </h1>
        </div>

        {/* ログインフォーム */}
        <div className="mt-8 rounded-[1.75rem] border border-white/70 bg-white/85 p-8 shadow-xl shadow-rose-950/5 backdrop-blur dark:border-white/10 dark:bg-white/[0.06] dark:shadow-black/40">
          <h2 className="text-center text-xl font-bold tracking-tight text-stone-800 dark:text-stone-50">
            おかえりなさい
          </h2>
          <p className="mt-2 text-center text-sm text-stone-500 dark:text-stone-400">
            ログインすると予約画面に進みます
          </p>

          <div className="mt-7">
            <LoginForm next={next} />
          </div>
        </div>

        {/* できること */}
        <ul className="mt-7 grid grid-cols-3 gap-3">
          {POINTS.map((point) => (
            <li
              key={point.title}
              className="flex flex-col items-center gap-2 rounded-2xl bg-white/50 px-2 py-4 text-center ring-1 ring-white/60 dark:bg-white/[0.06] dark:ring-white/10"
            >
              <span className="text-rose-500 dark:text-rose-300">
                <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  {point.icon}
                </svg>
              </span>
              <span className="text-xs font-medium leading-snug text-stone-700 dark:text-stone-200">
                {point.title}
              </span>
            </li>
          ))}
        </ul>

        {/* 動作確認用のアカウント */}
        <div className="mt-5 rounded-2xl border border-white/60 bg-white/45 px-5 py-4 text-xs leading-relaxed text-stone-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-400">
          <p className="mb-1.5 font-semibold text-stone-700 dark:text-stone-200">
            動作確認用のアカウント
          </p>
          <p>
            利用者{" "}
            <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px] text-stone-700 dark:bg-white/10 dark:text-stone-200">
              user1@example.com
            </code>
            {" / "}
            管理者{" "}
            <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px] text-stone-700 dark:bg-white/10 dark:text-stone-200">
              admin@example.com
            </code>
          </p>
          <p className="mt-1">
            パスワードは共通で{" "}
            <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px] text-stone-700 dark:bg-white/10 dark:text-stone-200">
              password1234
            </code>
            です。すべて仮のデータで、実在の氏名・メールアドレスは含みません。
          </p>
        </div>
      </div>
    </div>
  );
}
