-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Therapist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "bio" TEXT NOT NULL DEFAULT '',
    "experienceYears" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Therapist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Therapist" ("active", "id", "userId") SELECT "active", "id", "userId" FROM "Therapist";
DROP TABLE "Therapist";
ALTER TABLE "new_Therapist" RENAME TO "Therapist";
CREATE UNIQUE INDEX "Therapist_userId_key" ON "Therapist"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
