import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import { UserBar } from "./UserBar";

/** ページ共通のヘッダー。ピンク系のグラデーションで統一する。 */
export function TopNav({
  user,
  active,
}: {
  user: SessionUser;
  active: "booking" | "my-reservations";
}) {
  return (
    <div className="border-b border-rose-200/60 bg-gradient-to-r from-rose-100 via-rose-50 to-orange-50 px-6 py-4 dark:border-rose-500/20 dark:from-rose-950/40 dark:via-rose-950/20 dark:to-orange-950/20">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link
            href="/"
            className={
              active === "booking"
                ? "text-rose-600 dark:text-rose-300"
                : "text-black/60 hover:text-rose-600 dark:text-white/60 dark:hover:text-rose-300"
            }
          >
            予約する
          </Link>
          <Link
            href="/my-reservations"
            className={
              active === "my-reservations"
                ? "text-rose-600 dark:text-rose-300"
                : "text-black/60 hover:text-rose-600 dark:text-white/60 dark:hover:text-rose-300"
            }
          >
            自分の予約
          </Link>
        </nav>
        <UserBar user={user} />
      </div>
    </div>
  );
}
