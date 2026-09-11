// 予約の担当候補になるマッサージ師の一覧（Issue #9）。
// 予約画面の絞り込みチェックボックスの選択肢として使う。

import { prisma } from "@/lib/db";

/**
 * 担当候補になる条件。
 *
 * `Therapist.active` は「受付中かどうか」、`User.active` は「アカウントが有効かどうか」の別の話なので
 * 両方を見る（`app/actions/booking.ts` の空き枠計算と同じ条件）。
 *
 * **絞り込みの選択肢と空き枠計算で同じものを使う**ために 1 か所に置いている。
 * 条件がずれると「チェックできるのに、その人の枠が絶対に出てこない」状態になってしまう。
 */
export const SELECTABLE_THERAPIST_WHERE = {
  active: true,
  user: { active: true },
} as const;

export type SelectableTherapist = {
  id: string;
  name: string;
  /** "female" | "male"。画面ではこの値で性別ごとのグループに分ける */
  gender: string;
};

/** 絞り込みに出す施術者。表示名と性別は User が持っている */
export async function listSelectableTherapists(): Promise<SelectableTherapist[]> {
  const therapists = await prisma.therapist.findMany({
    where: SELECTABLE_THERAPIST_WHERE,
    include: { user: true },
    orderBy: { id: "asc" },
  });

  return therapists.map((t) => ({
    id: t.id,
    name: t.user.name,
    gender: t.user.gender,
  }));
}
