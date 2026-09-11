"use server";

// ヘッダーのメールボックス（アイコン + 未読件数バッジ）用の Server Actions。
// 中身を作るのは管理者向け（休みの登録・取消の通知）のみ。マッサージ師向けは
// ヘッダーに箱だけ用意しておき、今のところ誰もメッセージを送らないので常に空になる。

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { formatShort, hhmmOfLocal, toDateString } from "@/lib/dates";

export async function getUnreadMailboxCount(): Promise<number> {
  const user = await requireRole(["therapist", "admin"]);
  return prisma.mailboxMessage.count({ where: { toUserId: user.id, readAt: null } });
}

export type MailboxMessageRow = {
  id: string;
  body: string;
  createdAtLabel: string;
  unread: boolean;
};

/** 新しい順に最大 30 件 */
export async function listMyMailbox(): Promise<MailboxMessageRow[]> {
  const user = await requireRole(["therapist", "admin"]);
  const rows = await prisma.mailboxMessage.findMany({
    where: { toUserId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return rows.map((m) => ({
    id: m.id,
    body: m.body,
    createdAtLabel: `${formatShort(toDateString(m.createdAt))} ${hhmmOfLocal(m.createdAt)}`,
    unread: m.readAt === null,
  }));
}

/** メールボックスを開いたときに、未読を一括で既読にする */
export async function markAllMailboxRead(): Promise<void> {
  const user = await requireRole(["therapist", "admin"]);
  await prisma.mailboxMessage.updateMany({
    where: { toUserId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
}
