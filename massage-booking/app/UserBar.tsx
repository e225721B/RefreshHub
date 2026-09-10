import { ROLE_LABEL, isRole } from "@/lib/roles";
import type { SessionUser } from "@/lib/session";
import { logout } from "./login/actions";

/** ログイン中の人の表示とログアウト。予約画面・管理者画面の右上に置く。 */
export function UserBar({ user }: { user: SessionUser }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-black/70 dark:text-white/70">
        {user.name}
        <span className="ml-1.5 rounded-full bg-black/[.06] px-2 py-0.5 text-xs dark:bg-white/10">
          {isRole(user.role) ? ROLE_LABEL[user.role] : user.role}
        </span>
      </span>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-full border border-black/15 px-3.5 py-1.5 transition hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/10"
        >
          ログアウト
        </button>
      </form>
    </div>
  );
}
