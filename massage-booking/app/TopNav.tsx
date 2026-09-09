import type { SessionUser } from "@/lib/session";
import { UserBar } from "./UserBar";

/** ページ共通のヘッダー。ピンク系のグラデーションで統一する。 */
export function TopNav({ user }: { user: SessionUser }) {
  return (
    <div className="border-b border-rose-200/60 bg-gradient-to-r from-rose-100 via-rose-50 to-orange-50 px-6 py-4 dark:border-rose-500/20 dark:from-rose-950/40 dark:via-rose-950/20 dark:to-orange-950/20">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3">
        <UserBar user={user} />
      </div>
    </div>
  );
}
