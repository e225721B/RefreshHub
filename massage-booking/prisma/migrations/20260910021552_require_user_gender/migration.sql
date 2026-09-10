-- 性別を必須にする（2026-09-10 の指示）。
-- 利用者・管理者も登録時に必ず選ぶため、User.gender を NULL 可から NOT NULL へ変える。

-- 既存の NULL を埋めてから NOT NULL にする。
-- 対象はシードで入れた仮名のサンプルデータ（管理者 1 名・利用者 3 名）だけで、実在の人物ではない。
-- 値を推測して入れるのは本来やってはいけないため、ここでの 'female' は
-- 「NOT NULL に揃えるための暫定値」であり、正しい値は seed の再実行か画面から入れ直す。
UPDATE "User" SET "gender" = 'female' WHERE "gender" IS NULL;

-- RedefineTables: SQLite は列の NOT NULL を後から付けられないので User を作り直す
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_User" ("active", "email", "gender", "id", "name", "password", "role") SELECT "active", "email", "gender", "id", "name", "password", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
