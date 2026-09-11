import { redirect } from "next/navigation";
import { getCurrentUserForRequest } from "@/lib/session";
import { getUnreadMailboxCount } from "@/app/actions/mailbox";
import { MailboxButton } from "@/app/MailboxButton";
import { PushNotificationButton } from "@/app/PushNotificationButton";
import { TherapistHeader } from "./TherapistHeader";

/**
 * マッサージ師向け画面の入り口。マッサージ師と管理者だけが入れる（design.md 権限表）。
 * タブの切り替えは子ページ間の遷移なので、認証チェックはここ 1 か所にまとめる。
 */
export default async function TherapistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserForRequest();
  if (!user) redirect("/login?next=%2Ftherapist");
  if (user.role !== "therapist" && user.role !== "admin")
    redirect("/?denied=therapist");
  const unreadMailboxCount = await getUnreadMailboxCount();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-rose-50 via-orange-50/50 to-rose-50 dark:from-rose-950 dark:via-stone-950 dark:to-stone-950">
      <TherapistHeader
        user={user}
        actions={
          <>
            <PushNotificationButton />
            <MailboxButton initialUnreadCount={unreadMailboxCount} />
          </>
        }
      />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
