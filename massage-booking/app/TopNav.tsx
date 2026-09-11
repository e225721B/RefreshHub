"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/session";
import { HEADER_BAR, NAV_LINK, NAV_LINK_ACTIVE } from "./navStyles";
import { UserBar } from "./UserBar";

/** 利用者向け画面（トップ・予約する・マッサージ師）専用のヘッダー。ピンク系のグラデーションで統一する。 */
export function TopNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  function linkClass(href: string) {
    // "/therapist" が "/therapists" にも一致してしまわないよう、区切りまで含めて比べる
    const active =
      href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
    return `${NAV_LINK} ${active ? NAV_LINK_ACTIVE : ""}`;
  }

  return (
    <div className={`${HEADER_BAR} px-6 py-4`}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-5">
          <span className="text-sm font-bold text-rose-700 dark:text-rose-300">マッサージ室の予約</span>
          <nav className="flex flex-wrap items-center gap-5">
            <Link href="/" className={linkClass("/")}>
              トップ
            </Link>
            <Link href="/booking" className={linkClass("/booking")}>
              予約する
            </Link>
            <Link href="/therapists" className={linkClass("/therapists")}>
              マッサージ師
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {(user.role === "therapist" || user.role === "admin") && (
            <Link href="/therapist" className={linkClass("/therapist")}>
              マッサージ師向け
            </Link>
          )}
          {user.role === "admin" && (
            <Link href="/admin" className={linkClass("/admin")}>
              管理者向け
            </Link>
          )}
          <UserBar user={user} />
        </div>
      </div>
    </div>
  );
}
