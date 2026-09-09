"use server";

import { prisma } from "@/lib/db";
import { hhmmOfLocal, toDateString } from "@/lib/dates";

export type TherapistAssignment = {
  id: string;
  date: string; // "2026-09-08"
  startTime: string; // "09:00"
  endTime: string; // "10:00"（施術 + 15 分の枠終了）
  treatmentMin: number;
  bedName: string;
  userName: string; // 受ける利用者の表示名
  note: string | null;
};

/**
 * ログイン中のマッサージ師の、これからの担当予約一覧（B-6、AC-15）。
 * 他のマッサージ師の担当は含めない。マッサージ師でないユーザーなら空配列を返す。
 */
export async function listMyAssignments(userId: string): Promise<TherapistAssignment[]> {
  const therapist = await prisma.therapist.findUnique({ where: { userId } });
  if (!therapist) return [];

  const reservations = await prisma.reservation.findMany({
    where: { therapistId: therapist.id, status: "booked", startAt: { gte: new Date() } },
    include: { bed: true, user: true },
    orderBy: { startAt: "asc" },
  });

  return reservations.map((r) => ({
    id: r.id,
    date: toDateString(r.startAt),
    startTime: hhmmOfLocal(r.startAt),
    endTime: hhmmOfLocal(r.endAt),
    treatmentMin: r.treatmentMin,
    bedName: r.bed.name,
    userName: r.user.name,
    note: r.note,
  }));
}
