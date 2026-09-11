import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUserForRequest } from "@/lib/session";
import { AddUserDialog } from "./AddUserDialog";
import { AdminHeader } from "./AdminHeader";
import { hhmmOfLocal, shiftDate, toDateTime, todayString } from "@/lib/dates";
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
  const user = await getCurrentUserForRequest();
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

  // w-full は狭い画面だけ。body が flex で main が mx-auto のため、main は「中身の最大幅」に
  // 合わせて広がろうとする。その結果、表の min-w が overflow-x-auto の外へ漏れて
  // **ページ全体が画面幅より広くなり、ヘッダーやボタンが画面の外に出る**
  // （390px の画面で main が 544px になっていた）。w-full で幅を画面に固定し、
  // はみ出しは表の中だけで起こるようにする。
  // sm 以上は従来どおり w-auto に戻す（PC では main の幅が変わってしまうため）。
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:w-auto sm:px-6 sm:py-10">
      <AdminHeader
        title="予約状況"
        current="/admin"
        user={user}
        extraLinks={[{ href: "/therapist", label: "マッサージ師向け画面を見る" }]}
      />

      {/* スケジュール表とは別に、ユーザーの追加をここから行う（AC-17） */}
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/50 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5 dark:border-white/10 dark:bg-white/5">
        <div>
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">ユーザーの登録</p>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            利用者・マッサージ師・管理者のアカウントは、自己登録ではなく管理者が作ります。
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Link
            href="/admin/users"
            className="text-sm underline underline-offset-4 max-sm:order-2 max-sm:text-center"
          >
            登録済みの一覧
          </Link>
          <AddUserDialog />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
          <form className="flex flex-1 items-end gap-3" action="/admin">
            <label className="flex flex-1 flex-col gap-1.5 text-sm sm:flex-none">
              <span className="font-medium">日付</span>
              {/* スマートフォンでは 16px 未満の入力欄にフォーカスすると画面が拡大されるため、
                  狭い画面だけ text-base（16px）にする。以降の入力欄も同じ理由 */}
              <input
                type="date"
                name="date"
                defaultValue={date}
                className="w-full rounded-2xl border border-rose-200/70 bg-white px-4 py-2.5 text-base text-stone-800 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-4 focus:ring-rose-200/50 sm:w-auto sm:text-sm dark:border-white/15 dark:bg-white/5 dark:text-stone-100"
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
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Link
              href={`/admin?date=${shiftDate(date, -1)}`}
              className="flex-1 rounded-full border border-black/15 px-4 py-2.5 text-center text-sm transition hover:bg-black/[.04] sm:flex-none dark:border-white/20 dark:hover:bg-white/10"
            >
              ◁ 前日
            </Link>
            <Link
              href={`/admin?date=${shiftDate(date, 1)}`}
              className="flex-1 rounded-full border border-black/15 px-4 py-2.5 text-center text-sm transition hover:bg-black/[.04] sm:flex-none dark:border-white/20 dark:hover:bg-white/10"
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

      {/*
        狭い画面ではベッドの列が入り切らないので横スクロールさせる。
        そのとき時刻列も一緒に流れると「今どの行を見ているか」が分からなくなるため、
        時刻列だけ sticky left-0 で左端に貼り付ける（背景を塗らないと下の行が透けて重なる）。
      */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-sm max-sm:border-separate max-sm:border-spacing-0 max-sm:border-t max-sm:border-l max-sm:border-black/10 max-sm:dark:border-white/15">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-16 border border-black/10 bg-background px-2 py-2 shadow-[1px_0_0_var(--chart-grid)] text-left font-medium text-black/60 sm:w-20 sm:px-3 dark:border-white/15 dark:text-white/60 max-sm:border-t-0 max-sm:border-l-0">
                時刻
              </th>
              {beds.map((bed) => (
                <th
                  key={bed.id}
                  className="border border-black/10 px-2 py-2 text-left font-medium text-black/60 sm:px-3 dark:border-white/15 dark:text-white/60 max-sm:border-t-0 max-sm:border-l-0"
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
                  <th className="sticky left-0 z-10 border border-black/10 bg-background px-2 py-1.5 shadow-[1px_0_0_var(--chart-grid)] text-left font-normal tabular-nums text-black/60 sm:px-3 dark:border-white/15 dark:text-white/60 max-sm:border-t-0 max-sm:border-l-0">
                    {toHHMM(minute)}
                  </th>

                  {rest ? (
                    // 休憩も予約と同じ 1 つのブロックとして、1 時間ぶんまとめて描く
                    rest.start === minute ? (
                      <td
                        colSpan={beds.length}
                        rowSpan={(rest.end - rest.start) / STEP_MIN}
                        className="border border-black/10 bg-black/[.06] px-2 py-1.5 align-top text-black/50 sm:px-3 dark:border-white/15 dark:bg-white/10 dark:text-white/50 max-sm:border-t-0 max-sm:border-l-0"
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
                            className="border border-rose-200 bg-rose-100/70 px-2 py-1.5 align-top sm:px-3 dark:border-rose-400/30 dark:bg-rose-500/15 max-sm:border-t-0 max-sm:border-l-0"
                          >
                            {/* 列が狭いと 1 行では折り返して読みにくいので、名前と担当を段に分ける */}
                            <div className="font-semibold text-stone-800 dark:text-stone-100">
                              {r.user.name}
                            </div>
                            <div className="text-xs leading-snug text-black/60 dark:text-white/60">
                              {r.therapist.user.name} ／ 施術 {r.treatmentMin} 分
                            </div>
                          </td>
                        );
                      }
                      // 予約ブロックの 2 行目以降は、上のセルが rowSpan で覆っている
                      if (isCovered(bed.id, minute)) return null;
                      return (
                        <td
                          key={bed.id}
                          className="border border-black/10 px-2 py-1.5 sm:px-3 dark:border-white/15 max-sm:border-t-0 max-sm:border-l-0"
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
    </main>
  );
}
