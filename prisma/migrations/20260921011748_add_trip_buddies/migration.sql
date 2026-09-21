-- CreateTable
CREATE TABLE "TripBuddy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripBuddy_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripBuddy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TripBuddy_tripId_idx" ON "TripBuddy"("tripId");

-- CreateIndex
CREATE INDEX "TripBuddy_userId_idx" ON "TripBuddy"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TripBuddy_tripId_userId_key" ON "TripBuddy"("tripId", "userId");
