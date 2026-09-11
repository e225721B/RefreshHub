"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/session";
import { UserBar } from "./UserBar";

const NAV_LINK =
  "border-b-2 border-transparent pb-0.5 text-sm text-black/70 hover:text-rose-600 dark:text-white/70 dark:hover:text-rose-300";
const NAV_LINK_ACTIVE = "border-rose-500 font-semibold text-rose-600 dark:text-rose-300";
// メニューを開いたときの縦並び用。下線ではなく背景で選択中を示す（横一列の下線は縦並びだと分かりにくいため）
const MENU_LINK =
  "block rounded-lg px-3 py-2 text-sm text-black/70 hover:bg-black/[.04] dark:text-white/70 dark:hover:bg-white/10";
const MENU_LINK_ACTIVE = "bg-rose-500/10 font-semibold text-rose-600 dark:text-rose-300";

/**
 * ページ共通のヘッダー。ピンク系のグラデーションで統一する。
 *
 * 狭い画面ではタイトル＋ハンバーガーボタンの 1 行だけにし、リンク・ログイン中の人・
 * ログアウトはボタンを押したときに下へ開く縦並びのメニューにまとめる
 * （リンクが増えるたびに折り返しの行数が増えていくのを避けるため）。
 * sm 以上では従来どおり 1 行に横並びで表示する。
 */
export function TopNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // 別の画面へ移動したら、開いたままにしない。
  // useEffect ではなく「レンダー中に前回の値と比べて更新する」形にする
  // （React 公式が推奨する、props の変化に合わせて state をリセットする書き方）。
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMenuOpen(false);
  }

  function isActive(href: string) {
    // "/therapist" が "/therapists" にも一致してしまわないよう、区切りまで含めて比べる
    return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  }

  const links = [
    { href: "/", label: "トップ" },
    { href: "/booking", label: "予約する" },
    { href: "/therapists", label: "マッサージ師" },
    ...(user.role === "therapist" || user.role === "admin"
      ? [{ href: "/therapist", label: "マッサージ師向け" }]
      : []),
    ...(user.role === "admin" ? [{ href: "/admin", label: "管理者向け" }] : []),
  ];

  return (
    <div className="border-b border-rose-200/60 bg-gradient-to-r from-rose-100 via-rose-50 to-orange-50 dark:border-rose-500/20 dark:from-rose-950/40 dark:via-rose-950/20 dark:to-orange-950/20">
      <div className="mx-auto max-w-5xl px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-rose-700 dark:text-rose-300">マッサージ室の予約</span>

          {/* sm 以上: 従来どおりリンクとユーザー欄を横並びで表示 */}
          <nav className="hidden flex-wrap items-center gap-5 sm:flex">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={`${NAV_LINK} ${isActive(link.href) ? NAV_LINK_ACTIVE : ""}`}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center sm:flex">
            <UserBar user={user} />
          </div>

          {/* sm 未満: ハンバーガーボタン */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-rose-700 hover:bg-black/[.04] sm:hidden dark:text-rose-300 dark:hover:bg-white/10"
          >
            <svg className="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>

        {/* sm 未満・メニューを開いたときだけ表示する縦並びの中身 */}
        {menuOpen && (
          <div className="mt-3 space-y-3 border-t border-rose-200/60 pt-3 sm:hidden dark:border-rose-500/20">
            <nav className="flex flex-col gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${MENU_LINK} ${isActive(link.href) ? MENU_LINK_ACTIVE : ""}`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-rose-200/60 pt-3 dark:border-rose-500/20">
              <UserBar user={user} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
