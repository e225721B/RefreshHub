"use server";

// 集計の Server Action（AC-6 / AC-7 / 画面 A-2 = /admin/stats）。
//
// 集計は「誰がいつ何回使ったか」という個人単位の利用実績なので、管理者だけが見られる。
// 画面側でも管理者以外を弾いているが、Server Action は URL を知っていれば直接呼べてしまうため、
// ここでも必ず role を確認する（F-8）。
//
// 期間の決め方と数え方は lib/stats.ts に置き、この層は権限確認と受け渡しだけを担当する。

import { requireRole } from "@/lib/auth";
import { fetchStats, normalizeRange, type Stats } from "@/lib/stats";

/**
 * 期間を指定して集計する。
 * from / to は "YYYY-MM-DD"。未指定・壊れた値は既定（直近 30 日）に丸める。
 */
export async function getStats(from?: string, to?: string): Promise<Stats> {
  await requireRole(["admin"]);
  return fetchStats(normalizeRange(from, to));
}
