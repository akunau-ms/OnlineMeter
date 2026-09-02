-- CreateTable
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dashboardId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "thresholdValue" INTEGER,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DashboardWidget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DashboardWidget_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "statusSince" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "groupId" TEXT,
    "basicAuthUsername" TEXT,
    "basicAuthPassword" TEXT,
    "dnsRecordType" TEXT,
    "dnsExpectedValue" TEXT,
    "keyword" TEXT,
    "keywordInvert" BOOLEAN NOT NULL DEFAULT false,
    "certificateExpiresAt" DATETIME,
    CONSTRAINT "Monitor_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Monitor" ("active", "basicAuthPassword", "basicAuthUsername", "certificateExpiresAt", "createdAt", "dnsExpectedValue", "dnsRecordType", "expectedStatusMax", "expectedStatusMin", "groupId", "id", "intervalSeconds", "keyword", "keywordInvert", "name", "retries", "retryIntervalSeconds", "status", "target", "timeoutSeconds", "type", "updatedAt") SELECT "active", "basicAuthPassword", "basicAuthUsername", "certificateExpiresAt", "createdAt", "dnsExpectedValue", "dnsRecordType", "expectedStatusMax", "expectedStatusMin", "groupId", "id", "intervalSeconds", "keyword", "keywordInvert", "name", "retries", "retryIntervalSeconds", "status", "target", "timeoutSeconds", "type", "updatedAt" FROM "Monitor";
DROP TABLE "Monitor";
ALTER TABLE "new_Monitor" RENAME TO "Monitor";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
