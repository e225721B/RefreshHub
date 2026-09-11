// マッサージ師紹介画面（画面 3）に出す顔写真。
//
// 写真を持つのはサンプルデータの施術者（シードの t1〜t4）だけ。
// **実在の人のアカウントには、別人の写真を割り当てない。** 名前と顔が食い違うと
// 利用者は「この人に頼む」判断を間違える。写真が無い人は頭文字のアイコンで表示する。

/** 写真がある施術者の ID。ファイルは `public/therapists/<ID>.jpg` に置く */
const THERAPIST_PHOTO_IDS = new Set(["t1", "t2", "t3"]);

/** 顔写真の URL。無ければ null（呼び出し側で頭文字のアイコンに切り替える） */
export function therapistPhotoUrl(therapistId: string): string | null {
  return THERAPIST_PHOTO_IDS.has(therapistId) ? `/therapists/${therapistId}.jpg` : null;
}

/** 写真が無い人のアイコンに出す頭文字。「施術者 A」なら「施」、"shun" なら "S" */
export function therapistInitial(name: string): string {
  const first = [...name.trim()][0] ?? "?";
  return first.toUpperCase();
}
