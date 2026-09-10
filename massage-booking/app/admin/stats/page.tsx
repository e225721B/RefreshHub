import Link from "next/link";
import { redirect } from "next/navigation";
import { getStats } from "@/app/actions/stats";
import { formatShort, fromDateString, shiftDate, toDateString, todayString } from "@/lib/dates";
import { ROLE_LABEL, isRole } from "@/lib/roles";
import { getCurrentUser, nextCookieJar } from "@/lib/session";
import { formatMinutes, normalizeRange } from "@/lib/stats";
import { UserBar } from "../../UserBar";
import { HorizontalBarChart, PeriodChart } from "./Charts";

export const metadata = {
  title: "集計 | マッサージ室の予約",
};

/** よく見る期間をワンクリックで出せるようにする（毎回カレンダーを 2 回開かせない） */
function presets(): { label: string; from: string; to: string }[] {
  const today = todayString();
  const d = fromDateString(today);
  const monthStart = toDateString(new Date(d.getFullYear(), d.getMonth(), 1));
  const lastMonthStart = toDateString(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const lastMonthEnd = toDateString(new Date(d.getFullYear(), d.getMonth(), 0));
  const yearStart = toDateString(new Date(d.getFullYear(), 0, 1));

  return [
    { label: "今月", from: monthStart, to: today },
    { label: "先月", from: lastMonthStart, to: lastMonthEnd },
    { label: "直近 30 日", from: shiftDate(today, -29), to: today },
    { label: "直近 90 日", from: shiftDate(today, -89), to: today },
    { label: "今年", from: yearStart, to: today },
  ];
}

/** 管理者: 集計（AC-6 / AC-7 / 画面 5 = A-2） */
export default async function AdminStatsPage({
  searchParams,
}: {
  // Next.js 16 では searchParams は Promise。await が必要
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  // 「誰がいつ何回使ったか」を扱う画面なので、管理者だけが開ける（F-8 / 要件 Q-7）
  const user = await getCurrentUser(await nextCookieJar());
  if (!user) redirect("/login?next=%2Fadmin%2Fstats");
  if (user.role !== "admin") redirect("/?denied=admin");

  const params = await searchParams;
  // 画面の入力欄にも「実際に集計した期間」を出したいので、正した後の値を使う
  const range = normalizeRange(params.from, params.to);
  const stats = await getStats(range.from, range.to);
  const { summary } = stats;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">集計</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin" className="text-sm underline underline-offset-4">
            予約状況へ戻る
          </Link>
          <Link href="/admin/users" className="text-sm underline underline-offset-4">
            ユーザー管理
          </Link>
          <UserBar user={user} />
        </div>
      </header>

      {/* --- 期間指定 --------------------------------------------------- */}
      <section className="mb-8 rounded-2xl border border-rose-200/70 bg-rose-50/50 px-5 py-4 dark:border-white/10 dark:bg-white/5">
        <form className="flex flex-wrap items-end gap-3" action="/admin/stats">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">開始日</span>
            <input
              type="date"
              name="from"
              defaultValue={range.from}
              className="rounded-2xl border border-rose-200/70 bg-white px-4 py-2.5 text-sm text-stone-800 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-4 focus:ring-rose-200/50 dark:border-white/15 dark:bg-white/5 dark:text-stone-100"
            />
          </label>
          <span className="pb-3 text-sm text-black/40 dark:text-white/40">〜</span>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">終了日</span>
            <input
              type="date"
              name="to"
              defaultValue={range.to}
              className="rounded-2xl border border-rose-200/70 bg-white px-4 py-2.5 text-sm text-stone-800 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-4 focus:ring-rose-200/50 dark:border-white/15 dark:bg-white/5 dark:text-stone-100"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-gradient-to-r from-rose-400 to-orange-300 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:shadow-xl"
          >
            集計する
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {presets().map((p) => {
            const selected = p.from === range.from && p.to === range.to;
            return (
              <Link
                key={p.label}
                href={`/admin/stats?from=${p.from}&to=${p.to}`}
                aria-current={selected ? "true" : undefined}
                className={
                  selected
                    ? "rounded-full bg-stone-800 px-3.5 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-stone-900"
                    : "rounded-full border border-black/15 px-3.5 py-1.5 text-xs transition hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/10"
                }
              >
                {p.label}
              </Link>
            );
          })}
        </div>
      </section>

      {/* --- 集計値 ----------------------------------------------------- */}
      <section className="mb-10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="ユニーク利用者数"
            value={`${summary.uniqueUsers}`}
            unit="人"
            //note="延べ回数ではなく人数"
            emphasis
          />
          <StatTile label="合計施術回数" value={`${summary.reservations}`} unit="件" 
          //note="合計施術回数" 
          />
          <StatTile
            label="1 人あたり"
            value={`${summary.avgPerUser}`}
            unit="回"
            //note="予約数 ÷ 利用者数"
          />
          <StatTile
            label="合計施術時間"
            value={formatMinutes(summary.treatmentMin)}
            //note="清掃の 15 分は含まない"
          />
        </div>

        <p className="mt-3 text-sm text-black/70 dark:text-white/70">
          キャンセル率 <strong className="tabular-nums">{summary.cancel.rate}%</strong>
          <span className="ml-2 text-black/50 dark:text-white/50">
            （{summary.cancel.total} 件 ＝ 利用者都合 {summary.cancel.byUser} 件 ／ 運営都合{" "}
            {summary.cancel.byAdmin} 件）
          </span>
        </p>
      </section>

      {/* --- 期間別グラフ ------------------------------------------------ */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">期間別の利用</h2>
        <PeriodChart points={stats.period} />
      </section>

      {/* --- 時間帯別 / ベッド別 ------------------------------------------ */}
      <section className="mb-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-1 text-lg font-semibold">時間帯別の利用</h2>
          <p className="mb-3 text-sm text-black/60 dark:text-white/60">
            施術を始めた時刻で数えています。14 時台は休憩のため 0 件です。
          </p>
          <HorizontalBarChart
            rows={stats.byHour.map((h) => ({ key: `${h.hour}`, label: h.label, count: h.count }))}
            unit="件"
          />
        </div>
        <div>
          <h2 className="mb-1 text-lg font-semibold">ベッド別の利用</h2>
          <p className="mb-3 text-sm text-black/60 dark:text-white/60">
            偏りが大きいときは、案内の順番か割り当ての決め方を見直す材料になります。
          </p>
          <HorizontalBarChart
            rows={stats.byBed.map((b) => ({ key: b.bedId, label: b.name, count: b.count }))}
            unit="件"
          />
        </div>
      </section>

      {/* --- 一覧表（利用者名から A-4 = /admin/users へ） --------------------- */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">利用者別の一覧</h2>

        {stats.users.length === 0 ? (
          <p className="rounded-2xl border border-black/10 px-5 py-8 text-center text-sm text-black/50 dark:border-white/15 dark:text-white/50">
            この期間に利用された記録はありません。期間を広げてみてください。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {["利用者名", "権限", "利用回数", "合計施術時間", "最終利用日"].map((label) => (
                    <th
                      key={label}
                      className="border border-black/10 px-3 py-2 text-left font-medium dark:border-white/15"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.users.map((u) => (
                  <tr key={u.userId}>
                    <td className="border border-black/10 px-3 py-2 dark:border-white/15">
                      <Link
                        href={`/admin/users#user-${u.userId}`}
                        className="underline underline-offset-4"
                      >
                        {u.name}
                      </Link>
                    </td>
                    <td className="border border-black/10 px-3 py-2 dark:border-white/15">
                      {isRole(u.role) ? ROLE_LABEL[u.role] : u.role}
                    </td>
                    <td className="border border-black/10 px-3 py-2 tabular-nums dark:border-white/15">
                      {u.count} 回
                    </td>
                    <td className="border border-black/10 px-3 py-2 tabular-nums dark:border-white/15">
                      {formatMinutes(u.treatmentMin)}
                    </td>
                    <td className="border border-black/10 px-3 py-2 tabular-nums dark:border-white/15">
                      {formatShort(u.lastUsedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs leading-relaxed text-black/50 dark:text-white/50">
          実際に利用された予約を集計しています
        </p>
      </section>
    </main>
  );
}

/** 数字ひとつを大きく見せる箱。並べたときに桁の位置が揃うよう tabular-nums にする */
function StatTile({
  label,
  value,
  unit,
  note,
  emphasis,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "rounded-2xl border border-rose-300 bg-rose-50/70 px-4 py-3.5 dark:border-rose-400/40 dark:bg-rose-500/10"
          : "rounded-2xl border border-black/10 px-4 py-3.5 dark:border-white/15"
      }
    >
      <p className="text-xs text-black/60 dark:text-white/60">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-stone-800 dark:text-stone-100">
        {value}
        {unit && <span className="ml-1 text-sm font-medium">{unit}</span>}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-black/40 dark:text-white/40">{note}</p>}
    </div>
  );
}
