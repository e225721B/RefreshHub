import type { SessionUser } from "@/lib/session";
import { logout } from "./login/actions";

const ROLE_LABEL: Record<string, string> = {
  user: "利用者",
  therapist: "マッサージ師",
  admin: "管理者",
};

/** ログイン中の人の表示とログアウト。予約画面・管理者画面の右上に置く。 */
export function UserBar({ user }: { user: SessionUser }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-orange-300 text-xs font-semibold text-white">
          {user.name.slice(0, 1)}
        </span>
        <span className="text-black/70 dark:text-white/70">
          {user.name}
          <span className="ml-1.5 rounded-full bg-black/[.06] px-2 py-0.5 text-xs dark:bg-white/10">
            {ROLE_LABEL[user.role] ?? user.role}
          </span>
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
