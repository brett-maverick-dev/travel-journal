-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "verifyCode" TEXT,
    "codeExpires" DATETIME,
    "verifyAttempts" INTEGER NOT NULL DEFAULT 0,
    "resetCode" TEXT,
    "resetExpires" DATETIME,
    "resetAttempts" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT,
    "homeCity" TEXT NOT NULL DEFAULT '',
    "favoritePlace" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "facebookUrl" TEXT NOT NULL DEFAULT '',
    "instagramUrl" TEXT NOT NULL DEFAULT '',
    "tiktokUrl" TEXT NOT NULL DEFAULT '',
    "xUrl" TEXT NOT NULL DEFAULT '',
    "youtubeUrl" TEXT NOT NULL DEFAULT '',
    "pinterestUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("avatarUrl", "bio", "codeExpires", "createdAt", "email", "facebookUrl", "favoritePlace", "handle", "homeCity", "id", "instagramUrl", "isAdmin", "name", "passwordHash", "pinterestUrl", "resetCode", "resetExpires", "tiktokUrl", "verified", "verifyCode", "xUrl", "youtubeUrl") SELECT "avatarUrl", "bio", "codeExpires", "createdAt", "email", "facebookUrl", "favoritePlace", "handle", "homeCity", "id", "instagramUrl", "isAdmin", "name", "passwordHash", "pinterestUrl", "resetCode", "resetExpires", "tiktokUrl", "verified", "verifyCode", "xUrl", "youtubeUrl" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
