import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { GENDER_LABEL, isGender } from "@/lib/roles";
import { summarizeWeeklySchedule } from "@/lib/schedule-summary";
import { getCurrentUserForRequest } from "@/lib/session";
import { TopNav } from "../TopNav";

/** マッサージ師の紹介画面（画面 3）。得意な施術や雰囲気を見てから、予約するか選べる。 */
export default async function TherapistsPage() {
  const user = await getCurrentUserForRequest();
  if (!user) redirect("/login?next=%2Ftherapists");

  const therapists = await prisma.therapist.findMany({
    where: { active: true, user: { active: true } },
    include: { user: true, workHours: true },
    orderBy: { user: { name: "asc" } },
  });

  return (
    <>
      <TopNav user={user} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold">マッサージ師の紹介</h1>
          <p className="mt-1 text-sm text-rose-600/80 dark:text-rose-300/80">
            今日はどの人に、ほぐしてもらいましょうか。
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          {therapists.map((t) => {
            const gender = isGender(t.user.gender) ? t.user.gender : null;
            const tags = t.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean);

            return (
              <article
                key={t.id}
                className="flex gap-5 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm dark:border-rose-500/20 dark:bg-white/[.04]"
              >
                <div className="relative size-28 shrink-0 overflow-hidden rounded-full border border-rose-100 dark:border-rose-500/20">
                  <Image
                    src={`https://picsum.photos/seed/${t.id}/200/200`}
                    alt={`${t.user.name}の写真`}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold">{t.user.name}</h2>
                    {gender && (
                      <span className="rounded-full bg-black/[.06] px-2 py-0.5 text-xs dark:bg-white/10">
                        {GENDER_LABEL[gender]}
                      </span>
                    )}
                    <span className="text-xs text-black/60 dark:text-white/60">
                      経験 {t.experienceYears} 年
                    </span>
                  </div>

                  <p className="text-sm text-black/70 dark:text-white/70">{t.bio}</p>

                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-rose-200 px-2.5 py-1 text-xs text-rose-700 dark:border-rose-500/30 dark:text-rose-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-black/50 dark:text-white/50">
                    {summarizeWeeklySchedule(t.workHours)}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
