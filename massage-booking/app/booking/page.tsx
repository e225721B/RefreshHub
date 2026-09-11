import { redirect } from "next/navigation";
import { getCurrentUserForRequest } from "@/lib/session";
import { listSelectableTherapists } from "@/lib/therapists";
import { TopNav } from "../TopNav";
import { WeekSchedule } from "../WeekSchedule";

export default async function BookingPage({
  searchParams,
}: {
  // Next.js 16 では searchParams は Promise。await が必要。
  // `therapist` は紹介画面（/therapists）から「この施術者で予約する」で渡ってくる施術者 ID。
  searchParams: Promise<{ therapist?: string }>;
}) {
  const params = await searchParams;
  const requestedTherapistId = params.therapist?.trim() || null;
  // ログイン後にこの画面へ戻すときは、選ばれた施術者も一緒に持ち帰る
  const selfPath = requestedTherapistId
    ? `/booking?therapist=${encodeURIComponent(requestedTherapistId)}`
    : "/booking";

  // 未ログインならログイン画面へ。戻り先を渡し、ログイン後にここへ戻す。
  const user = await getCurrentUserForRequest();
  if (!user) redirect(`/login?next=${encodeURIComponent(selfPath)}`);
  // 絞り込みチェックボックスの選択肢（Issue #9）。
  // 画面が開いた時点で確定しているのでサーバー側で読み、クライアントからの取得往復を作らない
  const therapists = await listSelectableTherapists();

  // URL の施術者 ID は利用者が書き換えられるので、担当候補の中にいるかをここで確かめる。
  // 見つからなければ（受付終了・退職など）絞り込まず、いつもどおり全員で表示する。
  const focusedTherapist = requestedTherapistId
    ? therapists.find((t) => t.id === requestedTherapistId)
    : undefined;

  return (
    <>
      <TopNav user={user} />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:w-auto sm:px-6 sm:py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold">マッサージ室の予約</h1>
          <p className="mt-1 text-sm text-rose-600/80 dark:text-rose-300/80">
            {focusedTherapist
              ? `${focusedTherapist.name}さんの空いているマスを選んで、そのまま予約できます。`
              : "空いているマスを選んで、そのまま予約できます。"}
          </p>
        </header>

        {/*
          key を施術者 ID にして、別の施術者の URL へ移ったときに表を作り直させる。
          こうしないと同じ /booking の中での移動では最初の選択状態が残ってしまう。
        */}
        <WeekSchedule
          key={focusedTherapist?.id ?? "all"}
          userName={user.name}
          therapists={therapists}
          initialTherapistIds={focusedTherapist ? [focusedTherapist.id] : undefined}
        />
      </main>
    </>
  );
}
