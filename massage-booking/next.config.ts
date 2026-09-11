import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }],
  },
  // スマホなど、同じ Wi-Fi の別端末から開発サーバーを開いて確認するために許可するオリジン。
  // 既定では localhost 以外からのアクセスは dev サーバーが拒否し、
  // ホットリロードの通信が失敗し続けてページが再読み込みを繰り返す（操作が反映されない）原因になる。
  // IP は環境によって変わるため、繋がらないときはターミナルの `npm run dev` の "Network:" 行を確認して書き換える。
  allowedDevOrigins: ["192.168.65.177"],
  // 開発中だけ表示される丸いインジケーター（今どの画面かを示すもの）。
  // スマホの狭い画面では表の時刻列に重なって見づらいため非表示にする。
  // コードのエラー表示（ビルドエラーなど）はこの設定に関係なく出る。
  devIndicators: false,
};

export default nextConfig;
