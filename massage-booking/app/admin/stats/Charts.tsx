// 集計画面（A-2）の棒グラフ。
//
// グラフ用のライブラリは入れていない。棒グラフ 3 つのために依存を増やすと、
// 学生が中で何が起きているか追えなくなるため、div の高さ・幅で描く。
//
// 読み方を色だけに頼らせない: 2 系列には凡例を付け、数値は必ず文字でも出す
// （マウスを乗せたときの吹き出しと、下の「数字で見る」の表）。
//
// サーバーコンポーネント（データを受け取って描くだけで、状態を持たない）。

import type { PeriodPoint } from "@/lib/stats";

/** 棒の高さの割合（%）。最大値が 0 のときは 0 にして、0 除算を避ける */
function ratio(value: number, max: number): number {
  return max === 0 ? 0 : (value / max) * 100;
}

/** 目盛りの上限を、切りのよい数に上げる（棒が枠いっぱいに張り付かないように） */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const step = max <= 10 ? 1 : max <= 50 ? 5 : max <= 200 ? 10 : 50;
  return Math.ceil(max / step) * step;
}

/**
 * 期間別の棒グラフ。1 区切りにつき「予約数」「ユニーク利用者数」の 2 本を並べる。
 *
 * 2 本を並べるのは、この 2 つがずれることに意味があるから。
 * 予約数だけが伸びていれば「同じ人が何度も使っている」、
 * 2 本が一緒に伸びていれば「使う人そのものが増えている」と読める
 * （要件の「リピーターは二の次。いろんな人に使ってもらいたい」に直接答える）。
 */
export function PeriodChart({ points }: { points: PeriodPoint[] }) {
  const max = niceMax(Math.max(0, ...points.map((p) => Math.max(p.reservations, p.uniqueUsers))));
  // 棒が多いときは、下のラベルを間引いて重ならないようにする
  const labelStep = Math.ceil(points.length / 12);

  return (
    <div>
      <Legend
        items={[
          { color: "var(--chart-1)", label: "予約数" },
          { color: "var(--chart-2)", label: "ユニーク利用者数" },
        ]}
      />

      <div className="overflow-x-auto pt-12">
        <div className="min-w-[480px]">
          <div className="relative flex h-56 items-end gap-1 pl-10">
            {/* 目盛り線。数字より薄くして、棒より奥に見えるようにする */}
            {[0, 0.5, 1].map((t) => (
              <div
                key={t}
                className="pointer-events-none absolute left-10 right-0 flex items-center"
                style={{ bottom: `${t * 100}%` }}
              >
                <span className="absolute -left-10 w-8 text-right text-[11px] tabular-nums text-black/45 dark:text-white/45">
                  {Math.round(max * t)}
                </span>
                <span className="h-px w-full" style={{ backgroundColor: "var(--chart-grid)" }} />
              </div>
            ))}

            {points.map((p) => (
              <div
                key={p.key}
                className="group relative flex h-full flex-1 items-end justify-center gap-[2px]"
              >
                {/* 吹き出し。棒が細くて数字を書けないぶんをここで補う */}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-stone-800 px-2.5 py-1.5 text-[11px] leading-tight text-white shadow-lg group-hover:block dark:bg-stone-700">
                  <div className="font-semibold">{p.label}</div>
                  <div className="tabular-nums">予約 {p.reservations} 件</div>
                  <div className="tabular-nums">利用者 {p.uniqueUsers} 人</div>
                </div>

                <Bar
                  heightPercent={ratio(p.reservations, max)}
                  color="var(--chart-1)"
                  title={`${p.label} 予約 ${p.reservations} 件`}
                />
                <Bar
                  heightPercent={ratio(p.uniqueUsers, max)}
                  color="var(--chart-2)"
                  title={`${p.label} 利用者 ${p.uniqueUsers} 人`}
                />
              </div>
            ))}
          </div>

          <div className="mt-2 flex gap-1 pl-10">
            {points.map((p, i) => (
              <div
                key={p.key}
                className="flex-1 text-center text-[11px] leading-tight text-black/50 dark:text-white/50"
              >
                {i % labelStep === 0 ? p.label : ""}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* グラフを目で読めない場合（印刷・色の見え方・棒が細いとき）に、同じ内容を表でも出す */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-black/60 underline underline-offset-4 dark:text-white/60">
          数字で見る
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {["期間", "予約数", "ユニーク利用者数"].map((label) => (
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
              {points.map((p) => (
                <tr key={p.key}>
                  <td className="border border-black/10 px-3 py-1.5 dark:border-white/15">
                    {p.label}
                  </td>
                  <td className="border border-black/10 px-3 py-1.5 tabular-nums dark:border-white/15">
                    {p.reservations}
                  </td>
                  <td className="border border-black/10 px-3 py-1.5 tabular-nums dark:border-white/15">
                    {p.uniqueUsers}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Bar({
  heightPercent,
  color,
  title,
}: {
  heightPercent: number;
  color: string;
  title: string;
}) {
  return (
    <div
      title={title}
      className="w-full max-w-3 rounded-t"
      style={{
        // 0 件でも 1px だけ残す。棒が消えると「データが無い」のか「0 件」なのか区別できない
        height: `max(${heightPercent}%, 1px)`,
        backgroundColor: color,
      }}
    />
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-4 text-xs text-black/60 dark:text-white/60">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/**
 * 横向きの棒グラフ（時間帯別・ベッド別）。
 * 項目が少なく名前が長いので、縦棒よりこちらのほうが読みやすい。
 * 1 系列なので凡例は置かず、代わりに数値を棒の右に必ず書く。
 */
export function HorizontalBarChart({
  rows,
  unit,
}: {
  rows: { key: string; label: string; count: number }[];
  unit: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.count));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3 text-sm">
          <span className="w-14 shrink-0 text-right tabular-nums text-black/60 dark:text-white/60">
            {r.label}
          </span>
          <span
            className="h-4 flex-1 overflow-hidden rounded"
            style={{ backgroundColor: "var(--chart-track)" }}
          >
            <span
              className="block h-full rounded"
              style={{
                width: `max(${ratio(r.count, max)}%, ${r.count > 0 ? "2px" : "0px"})`,
                backgroundColor: "var(--chart-1)",
              }}
            />
          </span>
          <span className="w-20 shrink-0 tabular-nums text-black/70 dark:text-white/70">
            {r.count} {unit}
            {total > 0 && r.count > 0 && (
              <span className="ml-1 text-xs text-black/40 dark:text-white/40">
                {Math.round((r.count / total) * 100)}%
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
