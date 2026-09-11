// マッサージ師紹介画面（画面 3）に出す顔写真。
//
// 写真を持つのはサンプルデータの施術者（シードの t1〜t4）だけ。
// **実在の人のアカウントには、別人の写真を割り当てない。** 名前と顔が食い違うと
// 利用者は「この人に頼む」判断を間違える。写真が無い人は頭文字のアイコンで表示する。

/**
 * 写真がある施術者の ID。ファイルは `public/therapists/<ID>.jpg` に置く。
 *
 * 元画像（`app/therapist/images/image (N).png`）との対応と、性別を合わせてある。
 * 紹介画面と予約画面の絞り込みは「女性／男性」で分かれるので、顔と性別がずれると利用者が混乱する。
 *
 * | ID | 施術者 | 性別 | 元画像 |
 * |----|--------|------|--------|
 * | t1 | 施術者 A | 女性 | image (4) |
 * | t2 | 施術者 B | 男性 | image (1) |
 * | t3 | 施術者 C | 男性 | image (2) |
 * | t4 | 施術者 D | 男性 | image (5) |
 *
 * image (3)（女性）は予備。女性の施術者が増えたときに使う。
 */
const THERAPIST_PHOTO_IDS = new Set(["t1", "t2", "t3", "t4"]);

/** 顔写真の URL。無ければ null（呼び出し側で頭文字のアイコンに切り替える） */
export function therapistPhotoUrl(therapistId: string): string | null {
  return THERAPIST_PHOTO_IDS.has(therapistId) ? `/therapists/${therapistId}.jpg` : null;
}

/** 写真が無い人のアイコンに出す頭文字。「施術者 A」なら「施」、"shun" なら "S" */
export function therapistInitial(name: string): string {
  const first = [...name.trim()][0] ?? "?";
  return first.toUpperCase();
}
