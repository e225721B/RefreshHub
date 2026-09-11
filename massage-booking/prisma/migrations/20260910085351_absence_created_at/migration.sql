-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TherapistAbsence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "therapistId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TherapistAbsence_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TherapistAbsence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TherapistAbsence" ("createdById", "endAt", "id", "reason", "startAt", "therapistId") SELECT "createdById", "endAt", "id", "reason", "startAt", "therapistId" FROM "TherapistAbsence";
DROP TABLE "TherapistAbsence";
ALTER TABLE "new_TherapistAbsence" RENAME TO "TherapistAbsence";
CREATE INDEX "TherapistAbsence_therapistId_startAt_idx" ON "TherapistAbsence"("therapistId", "startAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
