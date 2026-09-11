import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserForRequest } from "@/lib/session";
import { getUnreadMailboxCount } from "@/app/actions/mailbox";
import { MailboxButton } from "@/app/MailboxButton";
import { PushNotificationButton } from "@/app/PushNotificationButton";
import { TherapistUserBar } from "./TherapistUserBar";
import { TherapistTabs } from "./TherapistTabs";

/**
 * マッサージ師向け画面の入り口。マッサージ師と管理者だけが入れる（design.md 権限表）。
 * タブの切り替えは子ページ間の遷移なので、認証チェックはここ 1 か所にまとめる。
 */
export default async function TherapistLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserForRequest();
  if (!user) redirect("/login?next=%2Ftherapist");
  if (user.role !== "therapist" && user.role !== "admin") redirect("/?denied=therapist");
  const unreadMailboxCount = await getUnreadMailboxCount();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-rose-50 via-orange-50/50 to-rose-50 dark:from-rose-950 dark:via-stone-950 dark:to-stone-950">
      <header className="border-b border-black/5 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-white/5">
        <div className="w-full px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">
              RefreshHub
              <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-200">
                マッサージ師
              </span>
            </span>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              {user.role === "admin" && (
                <Link
                  href="/"
                  className="text-xs text-stone-600 underline underline-offset-4 sm:text-sm dark:text-stone-300"
                >
                  予約画面へ戻る
                </Link>
              )}
              <PushNotificationButton />
              <MailboxButton initialUnreadCount={unreadMailboxCount} />
              <TherapistUserBar user={user} />
            </div>
          </div>
          <div className="mt-3">
            <TherapistTabs />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
