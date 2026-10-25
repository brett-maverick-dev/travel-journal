-- AlterTable
ALTER TABLE `User` ADD COLUMN `failedPasswordAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `passwordLockedUntil` DATETIME(3) NULL;
