// アプリの時刻はすべて **JST（Asia/Tokyo）固定**で扱う（design.md の設計上の判断）。
// 予約の日時は `new Date(年, 月, 日, 時, 分)` のようにローカル時刻で組み立て、
// 表示も `getHours()` などローカル時刻で読み出しているため、
// **サーバのタイムゾーンがずれると、予約時刻がそのままずれる**。
//
// Vercel の実行環境は既定が UTC。何もしないと日本時間との差 9 時間ぶん、
// 「9:00 の予約が 0:00 に見える」「今日の枠が前日として扱われる」といった形で壊れる。
//
// 本来は Vercel の環境変数に TZ=Asia/Tokyo を設定して解決する（手順書を参照）。
// このファイルはその設定を忘れたときの保険で、サーバ側でだけ TZ を上書きする。

export const APP_TIMEZONE = "Asia/Tokyo";

/** JST の UTC からのずれ（分）。Date.getTimezoneOffset() は西を正にとるため -540 になる */
const JST_OFFSET_MINUTES = -540;

// ブラウザ側では何もしない（利用者の端末の時計を書き換える話ではないため）
if (typeof window === "undefined") {
  if (process.env.TZ !== APP_TIMEZONE) {
    process.env.TZ = APP_TIMEZONE;
  }

  // 上書きしても直らない環境（TZ データが入っていないなど）に気づけるようにする
  if (new Date().getTimezoneOffset() !== JST_OFFSET_MINUTES) {
    console.error(
      `[timezone] サーバのタイムゾーンが JST になっていません（現在のずれ: ${-new Date().getTimezoneOffset()} 分）。` +
        `環境変数 TZ=${APP_TIMEZONE} を設定してください。予約時刻がずれた状態で動きます。`,
    );
  }
}
