import type { SessionUser } from "@/lib/session";
import { logout } from "@/app/login/actions";

/**
 * マッサージ師画面専用のログイン情報表示。
 * ヘッダーのタイトル横に既に「マッサージ師」バッジがあるため、共通の UserBar と違い
 * ユーザー名横の役割バッジは出さない。
 */
export function TherapistUserBar({ user }: { user: SessionUser }) {
  return (
    <div className="flex items-center gap-2 text-sm sm:gap-3">
      <span className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-orange-300 text-xs font-semibold text-white">
          {user.name.slice(0, 1)}
        </span>
        <span className="hidden text-black/70 sm:inline dark:text-white/70">{user.name}</span>
      </span>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-full border border-black/15 px-2.5 py-1.5 text-xs transition hover:bg-black/[.04] sm:px-3.5 sm:text-sm dark:border-white/20 dark:hover:bg-white/10"
        >
          ログアウト
        </button>
      </form>
    </div>
  );
}
