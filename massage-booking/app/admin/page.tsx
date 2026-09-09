import Link from "next/link";
import { prisma } from "@/lib/db";
import { STEP_MIN, toHHMM, toMinutes } from "@/lib/slots";

// 稼働時間。要件の Q-2「9:00〜14:00 と 15:00〜19:00」に合わせる。
const OPEN_RANGES = [
  { start: "09:00", end: "14:00" },
  { start: "15:00", end: "19:00" },
];

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 稼働時間を 15 分刻みに並べる */
function timeRows(): number[] {
  const rows: number[] = [];
  for (const range of OPEN_RANGES) {
    for (let t = toMinutes(range.start); t < toMinutes(range.end); t += STEP_MIN) {
      rows.push(t);
    }
  }
  return rows;
}

export default async function AdminPage({
  searchParams,
}: {
  // Next.js 16 では searchParams は Promise。await が必要。
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayString();

  const [beds, reservations] = await Promise.all([
    prisma.bed.findMany({ orderBy: { id: "asc" } }),
    prisma.reservation.findMany({
      where: { date },
      include: { therapist: true },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const rows = timeRows();

  /** その時刻・そのベッドに入っている予約を探す */
  function reservationAt(bedId: string, minute: number) {
    return reservations.find(
      (r) =>
        r.bedId === bedId &&
        toMinutes(r.startTime) <= minute &&
        minute < toMinutes(r.blockEndTime),
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">予約状況</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            どのベッドの、どの時間帯に予約が入っているかを一覧で確認できます。
          </p>
        </div>
        <Link href="/" className="text-sm underline underline-offset-4">
          予約画面へ戻る
        </Link>
      </header>

      <form className="mb-6 flex items-end gap-3" action="/admin">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">日付</span>
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="rounded border border-black/20 px-3 py-2 dark:border-white/25 dark:bg-transparent"
          />
        </label>
        <button type="submit" className="rounded bg-foreground px-4 py-2 text-sm text-background">
          表示
        </button>
      </form>

      <p className="mb-3 text-sm">
        {date} の予約: <strong>{reservations.length} 件</strong>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-black/10 px-3 py-2 text-left dark:border-white/15">
                時刻
              </th>
              {beds.map((bed) => (
                <th
                  key={bed.id}
                  className="border border-black/10 px-3 py-2 text-left dark:border-white/15"
                >
                  {bed.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((minute) => (
              <tr key={minute}>
                <th className="border border-black/10 px-3 py-1 text-left font-normal tabular-nums dark:border-white/15">
                  {toHHMM(minute)}
                </th>
                {beds.map((bed) => {
                  const r = reservationAt(bed.id, minute);
                  const isStart = r && toMinutes(r.startTime) === minute;
                  return (
                    <td
                      key={bed.id}
                      className={`border border-black/10 px-3 py-1 dark:border-white/15 ${
                        r ? "bg-blue-500/15" : ""
                      }`}
                    >
                      {isStart ? (
                        <span>
                          <strong>{r.userName}</strong>
                          <span className="text-black/60 dark:text-white/60">
                            {" "}
                            / {r.therapist.name} / 施術 {r.treatmentMin} 分
                          </span>
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
