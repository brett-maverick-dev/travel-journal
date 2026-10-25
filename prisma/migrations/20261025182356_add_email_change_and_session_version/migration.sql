-- AlterTable
ALTER TABLE `User` ADD COLUMN `emailChangeAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `emailChangeCode` VARCHAR(191) NULL,
    ADD COLUMN `emailChangeExpires` DATETIME(3) NULL,
    ADD COLUMN `pendingEmail` VARCHAR(191) NULL,
    ADD COLUMN `sessionVersion` INTEGER NOT NULL DEFAULT 0;
