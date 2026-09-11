import { NextResponse } from "next/server";
import { sendDailyDigest } from "@/lib/reminders";

/**
 * 外部の cron から1日1回（朝9時想定）叩いてもらうエンドポイント（AC-12）。
 * Vercel は Cron Jobs を使うと `CRON_SECRET` 環境変数を設定するだけで、
 * 自動的に `Authorization: Bearer <CRON_SECRET>` を付けて呼んでくれる。
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/remind] CRON_SECRET が未設定のため実行を拒否しました");
    return NextResponse.json(
      { ok: false, message: "CRON_SECRET が設定されていません" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const result = await sendDailyDigest();
  return NextResponse.json({ ok: true, ...result });
}
