-- 性別を Therapist から User へ移す。
-- 利用者・管理者も性別を選べるようにするため（学生の指示 2026-09-09）。
-- 同じ情報を 2 か所に持たないよう、Therapist.gender は残さず移動する。

-- AlterTable: まず User に列を足す（任意項目なので NULL 可）
ALTER TABLE "User" ADD COLUMN "gender" TEXT;

-- 既存のマッサージ師の性別を User 側へ移す（この UPDATE は Therapist を作り直す前に実行する）
UPDATE "User"
SET "gender" = (SELECT "gender" FROM "Therapist" WHERE "Therapist"."userId" = "User"."id")
WHERE "id" IN (SELECT "userId" FROM "Therapist");

-- RedefineTables: SQLite は列を落とせないので Therapist を作り直す
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Therapist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Therapist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Therapist" ("id", "userId", "active") SELECT "id", "userId", "active" FROM "Therapist";
DROP TABLE "Therapist";
ALTER TABLE "new_Therapist" RENAME TO "Therapist";
CREATE UNIQUE INDEX "Therapist_userId_key" ON "Therapist"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
