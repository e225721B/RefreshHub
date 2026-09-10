// 利用者本人によるキャンセルの締切ルール（design.md D-3）。
// 利用者は施術開始の 2 時間前まで。管理者のキャンセルはいつでも可（C 側の別アクションで扱う。ここでは対象外）。

export const USER_CANCEL_CUTOFF_HOURS = 2;

/** 利用者本人が「今」キャンセルできるか（施術開始の 2 時間前まで） */
export function canUserCancel(startAt: Date, now: Date = new Date()): boolean {
  const cutoff = new Date(startAt.getTime() - USER_CANCEL_CUTOFF_HOURS * 60 * 60 * 1000);
  return now < cutoff;
}
