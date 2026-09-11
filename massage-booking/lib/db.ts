// Prisma クライアントの使い回し。
// 開発中は Next.js がファイル変更のたびにモジュールを読み直すため、
// 毎回 new すると接続が増え続ける。グローバルに 1 つだけ持たせて防ぐ。

// DB を触るコードは必ずここを通るので、タイムゾーンの設定もここで読み込む。
// （予約の日時をローカル時刻で組み立てているため、サーバが UTC のままだと 9 時間ずれる）
import "@/lib/timezone";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
