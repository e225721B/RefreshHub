import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import { UserBar } from "../UserBar";

/** 管理者画面は 3 つ。どこにいてもタブで行き来できるようにする */
const PAGES = [
  { href: "/admin", label: "予約状況" },
  { href: "/admin/stats", label: "集計" },
  { href: "/admin/users", label: "ユーザー管理" },
] as const;

type AdminPath = (typeof PAGES)[number]["href"];

/**
 * 管理者画面の共通ヘッダー（見出し・画面切り替え・ログイン中の人）。
 *
 * 3 画面で同じものを書いていたので 1 か所にまとめた。
 * 狭い画面では 2 段に折り返す:
 *   1 段目 = 見出し ＋ ユーザー欄、2 段目 = 画面切り替えのタブ（入り切らなければ横スクロール）。
 * sm 以上では 1 行に戻し、タブを見出しの右へ置く（order で並び順だけ入れ替える）。
 */
export function AdminHeader({
  title,
  current,
  user,
  /** 管理者画面以外への行き先（例: マッサージ師向け画面）。タブではなくリンクとして末尾に置く */
  extraLinks = [],
}: {
  title: string;
  current: AdminPath;
  user: SessionUser;
  extraLinks?: { href: string; label: string }[];
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>

      <div className="order-2 sm:order-3">
        <UserBar user={user} />
      </div>

      {/* w-full で狭い画面では必ず 2 段目に落とす。sm 以上は幅なりに 1 行へ収める */}
      <nav
        aria-label="管理者メニュー"
        className="order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:order-2 sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0"
      >
        <div className="flex w-max gap-1.5 sm:w-auto">
          {PAGES.map((page) => {
            const selected = page.href === current;
            return (
              <Link
                key={page.href}
                href={page.href}
                aria-current={selected ? "page" : undefined}
                className={
                  selected
                    ? "rounded-full bg-stone-800 px-4 py-2 text-sm font-semibold whitespace-nowrap text-white dark:bg-white dark:text-stone-900"
                    : "rounded-full border border-black/15 px-4 py-2 text-sm whitespace-nowrap transition hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/10"
                }
              >
                {page.label}
              </Link>
            );
          })}

          {/* 管理者画面のタブではないので、囲みを付けずリンクのまま並べる */}
          {extraLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center px-2 text-sm whitespace-nowrap underline underline-offset-4"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
