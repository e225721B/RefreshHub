/*
  Warnings:

  - You are about to drop the `AbsenceRequest` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AbsenceRequest";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "MailboxMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    CONSTRAINT "MailboxMessage_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MailboxMessage_toUserId_idx" ON "MailboxMessage"("toUserId");
