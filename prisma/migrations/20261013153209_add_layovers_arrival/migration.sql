-- AlterTable
ALTER TABLE `Trip` ADD COLUMN `arrivalCity` VARCHAR(500) NOT NULL DEFAULT '',
    ADD COLUMN `arrivalLat` DOUBLE NULL,
    ADD COLUMN `arrivalLng` DOUBLE NULL;

-- CreateTable
CREATE TABLE `Layover` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(500) NOT NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `Layover_tripId_idx`(`tripId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Layover` ADD CONSTRAINT `Layover_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
