-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Monitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 48,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "retryIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "expectedStatusMin" INTEGER,
    "expectedStatusMax" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "groupId" TEXT,
    CONSTRAINT "Monitor_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Monitor" ("active", "createdAt", "expectedStatusMax", "expectedStatusMin", "id", "intervalSeconds", "name", "retries", "retryIntervalSeconds", "status", "target", "timeoutSeconds", "type", "updatedAt") SELECT "active", "createdAt", "expectedStatusMax", "expectedStatusMin", "id", "intervalSeconds", "name", "retries", "retryIntervalSeconds", "status", "target", "timeoutSeconds", "type", "updatedAt" FROM "Monitor";
DROP TABLE "Monitor";
ALTER TABLE "new_Monitor" RENAME TO "Monitor";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
