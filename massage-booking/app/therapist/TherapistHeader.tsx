"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/session";
import { HEADER_BAR, NAV_LINK, NAV_LINK_ACTIVE } from "../navStyles";
import { UserBar } from "../UserBar";
import { THERAPIST_PAGES } from "./therapistNav";

/**
 * マッサージ師向け画面の共通ヘッダー。
 *
 * 利用者向けのヘッダー（トップ・予約する・マッサージ師）は出さない。マッサージ師の
 * 画面切り替え（シフト一覧・自分の担当する予約・休みの登録）を中央に置き、
 * 右側にログイン中の人の表示をまとめる。色・下線ナビの見た目は他のヘッダーと揃える。
 */
export function TherapistHeader({
  user,
  actions,
}: {
  user: SessionUser;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();

  // THERAPIST_PAGES は "/therapist" が他の 2 つの prefix になる（例: "/therapist/today"）ので、
  // 最も長く一致した 1 件だけを active にする
  const activeHref = THERAPIST_PAGES.filter(
    (page) => pathname === page.href || pathname.startsWith(`${page.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className={`${HEADER_BAR} px-4 py-4 sm:px-6`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span className="text-sm font-bold text-rose-700 dark:text-rose-300">
          マッサージ師
        </span>

        <nav
          aria-label="マッサージ師向けメニュー"
          className="flex flex-wrap items-center justify-center gap-5 sm:flex-1"
        >
          {THERAPIST_PAGES.map((page) => {
            const selected = page.href === activeHref;
            return (
              <Link
                key={page.href}
                href={page.href}
                aria-current={selected ? "page" : undefined}
                className={`${NAV_LINK} ${selected ? NAV_LINK_ACTIVE : ""}`}
              >
                {page.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          {user.role === "admin" && (
            <Link href="/" className={NAV_LINK}>
              利用者向け
            </Link>
          )}
          {actions}
          <UserBar user={user} />
        </div>
      </div>
    </div>
  );
}
