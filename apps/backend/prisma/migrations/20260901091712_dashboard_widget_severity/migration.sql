-- RedefineTables
-- Replaces DashboardWidget.thresholdValue with warningThreshold/criticalThreshold
-- (specs/028 research.md decision 2). Every existing row's thresholdValue is
-- carried over as its new criticalThreshold in the same INSERT...SELECT that
-- copies the table across — no separate backfill step needed since SQLite
-- requires a full table rebuild to drop a column anyway. warningThreshold is
-- left NULL for every pre-existing row (FR-004: identical Normal/Critical-only
-- behavior to before this migration).
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DashboardWidget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dashboardId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "warningThreshold" INTEGER,
    "criticalThreshold" INTEGER,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DashboardWidget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DashboardWidget_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DashboardWidget" ("id", "dashboardId", "monitorId", "triggerType", "criticalThreshold", "position", "createdAt")
SELECT "id", "dashboardId", "monitorId", "triggerType", "thresholdValue", "position", "createdAt" FROM "DashboardWidget";
DROP TABLE "DashboardWidget";
ALTER TABLE "new_DashboardWidget" RENAME TO "DashboardWidget";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
