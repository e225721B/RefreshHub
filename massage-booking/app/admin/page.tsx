import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, nextCookieJar } from "@/lib/session";
import { UserBar } from "../UserBar";
import { AddUserDialog } from "./AddUserDialog";
import { formatShort, hhmmOfLocal, shiftDate, toDateTime, todayString } from "@/lib/dates";
import { STEP_MIN, toHHMM, toMinutes } from "@/lib/slots";
import { DEFAULT_WORK_WINDOWS } from "@/lib/business-hours";

const WINDOWS = DEFAULT_WORK_WINDOWS.map((w) => ({
  start: toMinutes(w.startTime),
  end: toMinutes(w.endTime),
}));

const DAY_START = WINDOWS[0].start;
const DAY_END = WINDOWS[WINDOWS.length - 1].end;

/**
 * 表の行（15 分刻み）。**休憩時間も飛ばさずに並べる。**
 * 9:00〜20:00 を通しで出し、勤務時間の外（14:00〜15:00）は休憩として表示する。
 */
function timeRows(): number[] {
  const rows: number[] = [];
  for (let t = DAY_START; t < DAY_END; t += STEP_MIN) rows.push(t);
  return rows;
}

/** 勤務時間の「あいだ」= 休憩。DEFAULT_WORK_WINDOWS の隙間から求める */
const BREAKS = WINDOWS.slice(0, -1).map((w, i) => ({ start: w.end, end: WINDOWS[i + 1].start }));

function breakAt(minute: number) {
  return BREAKS.find((b) => b.start <= minute && minute < b.end);
}

/** ベッド 1 台が 1 日に提供できる枠の数（休憩を除く） */
const SLOTS_PER_BED = WINDOWS.reduce((sum, w) => sum + (w.end - w.start) / STEP_MIN, 0);

export default async function AdminPage({
  searchParams,
}: {
  // Next.js 16 では searchParams は Promise。await が必要。
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  // 予約状況は個人単位の利用実績にあたるため、管理者だけが開ける（要件 Q-7 / F-8）
  const user = await getCurrentUser(await nextCookieJar());
  if (!user) redirect("/login?next=%2Fadmin");
  if (user.role !== "admin") redirect("/?denied=admin");

  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayString();

  const start = toDateTime(date, "00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [beds, reservations] = await Promise.all([
    prisma.bed.findMany({ orderBy: { id: "asc" } }),
    prisma.reservation.findMany({
      // キャンセル済みは枠を押さえていないので出さない
      where: { status: "booked", startAt: { gte: start, lt: end } },
      include: { user: true, therapist: { include: { user: true } } },
      orderBy: { startAt: "asc" },
    }),
  ]);

  const rows = timeRows();

  /** 予約を「開始時刻・押さえる枠の長さ（15 分いくつ分か）」に直しておく */
  const blocks = reservations.map((r) => {
    const startMin = toMinutes(hhmmOfLocal(r.startAt));
    const endMin = toMinutes(hhmmOfLocal(r.endAt));
    return { reservation: r, startMin, endMin, slots: (endMin - startMin) / STEP_MIN };
  });

  /** その時刻に始まる予約（見つかればその行に 1 つのブロックとして描く） */
  function blockStartingAt(bedId: string, minute: number) {
    return blocks.find((b) => b.reservation.bedId === bedId && b.startMin === minute);
  }

  /** その時刻が予約に覆われているか（ブロックの 2 行目以降は td を出さない） */
  function isCovered(bedId: string, minute: number) {
    return blocks.some(
      (b) => b.reservation.bedId === bedId && b.startMin < minute && minute < b.endMin,
    );
  }

  // 稼働率 = 予約が押さえた枠 ÷（ベッド数 × 1 台あたりの枠数）。清掃の 15 分も「押さえた枠」に含む
  const capacity = beds.length * SLOTS_PER_BED;
  const usedSlots = blocks.reduce((sum, b) => sum + b.slots, 0);
  const usageRate = capacity === 0 ? 0 : Math.round((usedSlots / capacity) * 100);

  const isToday = date === todayString();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">予約状況</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {isToday
              ? "今日、みんながひと息ついている様子です。"
              : `${formatShort(date)} の予約の入り方です。`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin/users" className="text-sm underline underline-offset-4">
            ユーザー管理
          </Link>
          <Link href="/therapist" className="text-sm underline underline-offset-4">
            マッサージ師向け画面を見る
          </Link>
          <UserBar user={user} />
        </div>
      </header>

      {/* スケジュール表とは別に、ユーザーの追加をここから行う（AC-17） */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/50 px-5 py-4 dark:border-white/10 dark:bg-white/5">
        <div>
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">ユーザーの登録</p>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            利用者・マッサージ師・管理者のアカウントは、自己登録ではなく管理者が作ります。
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/users" className="text-sm underline underline-offset-4">
            登録済みの一覧
          </Link>
          <AddUserDialog />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <form className="flex items-end gap-3" action="/admin">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">日付</span>
              <input
                type="date"
                name="date"
                defaultValue={date}
                className="rounded-2xl border border-rose-200/70 bg-white px-4 py-2.5 text-sm text-stone-800 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-4 focus:ring-rose-200/50 dark:border-white/15 dark:bg-white/5 dark:text-stone-100"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-gradient-to-r from-rose-400 to-orange-300 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:shadow-xl"
            >
              表示
            </button>
          </form>

          {/* 1 日ずつ動かす。カレンダーを開かずに前後を見られるように */}
          <div className="flex items-center gap-2">
            <Link
              href={`/admin?date=${shiftDate(date, -1)}`}
              className="rounded-full border border-black/15 px-4 py-2.5 text-sm transition hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/10"
            >
              ◁ 前日
            </Link>
            <Link
              href={`/admin?date=${shiftDate(date, 1)}`}
              className="rounded-full border border-black/15 px-4 py-2.5 text-sm transition hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/10"
            >
              翌日 ▷
            </Link>
          </div>
        </div>

        <p className="text-sm text-black/70 dark:text-white/70">
          {date} の予約: <strong>{reservations.length} 件</strong>
          <span className="mx-2 text-black/30 dark:text-white/30">／</span>
          稼働率 <strong>{usageRate}%</strong>
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-20 border border-black/10 px-3 py-2 text-left font-medium text-black/60 dark:border-white/15 dark:text-white/60">
                時刻
              </th>
              {beds.map((bed) => (
                <th
                  key={bed.id}
                  className="border border-black/10 px-3 py-2 text-left font-medium text-black/60 dark:border-white/15 dark:text-white/60"
                >
                  {bed.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((minute) => {
              const rest = breakAt(minute);
              return (
                <tr key={minute}>
                  <th className="border border-black/10 px-3 py-1.5 text-left font-normal tabular-nums text-black/60 dark:border-white/15 dark:text-white/60">
                    {toHHMM(minute)}
                  </th>

                  {rest ? (
                    // 休憩も予約と同じ 1 つのブロックとして、1 時間ぶんまとめて描く
                    rest.start === minute ? (
                      <td
                        colSpan={beds.length}
                        rowSpan={(rest.end - rest.start) / STEP_MIN}
                        className="border border-black/10 bg-black/[.06] px-3 py-1.5 align-top text-black/50 dark:border-white/15 dark:bg-white/10 dark:text-white/50"
                      >
                        休憩（{toHHMM(rest.start)}〜{toHHMM(rest.end)}）
                      </td>
                    ) : null
                  ) : (
                    beds.map((bed) => {
                      const block = blockStartingAt(bed.id, minute);
                      if (block) {
                        const r = block.reservation;
                        return (
                          <td
                            key={bed.id}
                            rowSpan={block.slots}
                            className="border border-rose-200 bg-rose-100/70 px-3 py-1.5 align-top dark:border-rose-400/30 dark:bg-rose-500/15"
                          >
                            <strong className="text-stone-800 dark:text-stone-100">
                              {r.user.name}
                            </strong>
                            <span className="text-black/60 dark:text-white/60">
                              {" "}
                              / {r.therapist.user.name} / 施術 {r.treatmentMin} 分
                            </span>
                          </td>
                        );
                      }
                      // 予約ブロックの 2 行目以降は、上のセルが rowSpan で覆っている
                      if (isCovered(bed.id, minute)) return null;
                      return (
                        <td
                          key={bed.id}
                          className="border border-black/10 px-3 py-1.5 dark:border-white/15"
                        />
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-black/50 dark:text-white/50">
        稼働率は「予約が押さえた枠 ÷（ベッド {beds.length} 台 × 1 台あたり {SLOTS_PER_BED} 枠）」。
        押さえる枠には清掃・準備の 15 分を含みます。キャンセル済みの予約は表にも件数にも出しません。
      </p>
    </main>
  );
}
