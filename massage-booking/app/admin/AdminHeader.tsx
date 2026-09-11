import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import { HEADER_BAR, NAV_LINK, NAV_LINK_ACTIVE } from "../navStyles";
import { UserBar } from "../UserBar";
import { ADMIN_PAGES } from "./adminNav";

type AdminPath = (typeof ADMIN_PAGES)[number]["href"];

/**
 * 管理者画面の共通ヘッダー（見出し・画面切り替え・ログイン中の人）。
 *
 * 利用者向けのヘッダー（トップ・予約する・マッサージ師）は出さない。管理者は管理者の
 * 画面切り替えだけに集中できるようにする。TopNav・マッサージ師向けヘッダーと同じく
 * `<main>` の外（画面の端から端まで）に置く。
 */
export function AdminHeader({
  current,
  user,
  /** メールボックス・プッシュ通知ボタンなど、ユーザー欄の手前に置くボタン類 */
  actions,
}: {
  current: AdminPath;
  user: SessionUser;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`${HEADER_BAR} px-4 py-4 sm:px-6`}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-5">
          {/* 現在地はすぐ下のタブがそのまま示すので、ここで同じ文字を繰り返さない */}
          <span className="text-sm font-bold text-rose-700 dark:text-rose-300">
            管理者
          </span>
          <nav
            aria-label="管理者メニュー"
            className="flex flex-wrap items-center gap-5"
          >
            {ADMIN_PAGES.map((page) => {
              const selected = page.href === current;
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
        </div>

        <div className="flex items-center gap-4">
          <Link href="/therapist" className={NAV_LINK}>
            マッサージ師向け
          </Link>
          {actions}
          <UserBar user={user} />
        </div>
      </div>
    </div>
  );
}
