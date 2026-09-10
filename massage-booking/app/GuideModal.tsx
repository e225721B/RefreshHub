"use client";

import { useState } from "react";

/**
 * 利用ガイド（AC-5）。
 * 「15 分から受けられる」ことが共有されておらず、1 時間必須だと思って使わない人がいる、
 * という要件の困りごとに直接対応する。
 */
export function GuideModal({
  className = "rounded-full border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10",
  label = "利用ガイドを見る",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-xl font-bold">マッサージ室の利用ガイド</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-semibold">施術時間</dt>
                <dd>
                  <strong>15 分 / 30 分 / 45 分から選べます。</strong>
                  1 時間まるごと空いていなくても大丈夫です。
                </dd>
              </div>
              <div>
                <dt className="font-semibold">予約のしかた</dt>
                <dd>
                  スケジュール表の<strong>空いているマスを縦にドラッグ</strong>して施術時間を選びます。
                  1 マス = 15 分で、最大 3 マス（45 分）まで選べます。
                </dd>
              </div>
              <div>
                <dt className="font-semibold">押さえる枠</dt>
                <dd>施術時間 + 15 分（清掃・準備の時間）。45 分の施術なら 60 分の枠になります。</dd>
              </div>
              <div>
                <dt className="font-semibold">利用できる時間</dt>
                <dd>9:00〜14:00 と 15:00〜20:00（14:00〜15:00 は休憩）</dd>
              </div>
              <div>
                <dt className="font-semibold">場所とベッド</dt>
                <dd>マッサージ室（扉 1 つ）。中にベッドが 3 台あります（A / B / C）</dd>
              </div>
              <div>
                <dt className="font-semibold">施術者</dt>
                <dd>
                  女性・男性の施術者がいます。一覧に性別が表示されるので、絞り込んで選べます。
                  <span className="text-black/60 dark:text-white/60">
                    （午後は男性のみの場合があります）
                  </span>
                </dd>
              </div>
              <div>
                <dt className="font-semibold">施術者の指名</dt>
                <dd>指名は不要です。時間を選ぶと、空いている施術者とベッドが自動で決まります。</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 w-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-2 font-semibold text-white shadow-sm"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  );
}
