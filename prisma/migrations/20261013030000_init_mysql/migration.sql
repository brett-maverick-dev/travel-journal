-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `handle` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `isAdmin` BOOLEAN NOT NULL DEFAULT false,
    `verifyCode` VARCHAR(191) NULL,
    `codeExpires` DATETIME(3) NULL,
    `verifyAttempts` INTEGER NOT NULL DEFAULT 0,
    `resetCode` VARCHAR(191) NULL,
    `resetExpires` DATETIME(3) NULL,
    `resetAttempts` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(191) NOT NULL DEFAULT '',
    `avatarUrl` VARCHAR(1024) NULL,
    `homeCity` VARCHAR(191) NOT NULL DEFAULT '',
    `favoritePlace` VARCHAR(191) NOT NULL DEFAULT '',
    `bio` TEXT NOT NULL,
    `facebookUrl` VARCHAR(1024) NOT NULL DEFAULT '',
    `instagramUrl` VARCHAR(1024) NOT NULL DEFAULT '',
    `tiktokUrl` VARCHAR(1024) NOT NULL DEFAULT '',
    `xUrl` VARCHAR(1024) NOT NULL DEFAULT '',
    `youtubeUrl` VARCHAR(1024) NOT NULL DEFAULT '',
    `pinterestUrl` VARCHAR(1024) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_handle_key`(`handle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Buddy` (
    `id` VARCHAR(191) NOT NULL,
    `requesterId` VARCHAR(191) NOT NULL,
    `addresseeId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Buddy_requesterId_idx`(`requesterId`),
    INDEX `Buddy_addresseeId_idx`(`addresseeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Trip` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(500) NOT NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT '',
    `visibility` VARCHAR(191) NOT NULL DEFAULT 'PRIVATE',
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `coverUrl` VARCHAR(1024) NULL,
    `departureCity` VARCHAR(191) NOT NULL DEFAULT '',
    `departureDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Trip_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TripBuddy` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TripBuddy_tripId_idx`(`tripId`),
    INDEX `TripBuddy_userId_idx`(`userId`),
    UNIQUE INDEX `TripBuddy_tripId_userId_key`(`tripId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Destination` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(500) NOT NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `arrive` DATETIME(3) NOT NULL,
    `depart` DATETIME(3) NOT NULL,
    `transport` VARCHAR(191) NOT NULL DEFAULT 'Flight',
    `detail` VARCHAR(500) NOT NULL DEFAULT '',
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `Destination_tripId_idx`(`tripId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Page` (
    `id` VARCHAR(191) NOT NULL,
    `tripId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'DAY',
    `parentId` VARCHAR(191) NULL,
    `title` VARCHAR(500) NOT NULL DEFAULT 'Untitled page',
    `date` DATETIME(3) NOT NULL,
    `time` VARCHAR(191) NULL,
    `place` VARCHAR(191) NOT NULL DEFAULT '',
    `weather` VARCHAR(191) NOT NULL DEFAULT '',
    `spend` VARCHAR(191) NOT NULL DEFAULT '',
    `steps` VARCHAR(191) NOT NULL DEFAULT '',
    `notes` TEXT NOT NULL,
    `tags` TEXT NOT NULL,
    `hidden` BOOLEAN NOT NULL DEFAULT false,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `Page_tripId_idx`(`tripId`),
    INDEX `Page_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Photo` (
    `id` VARCHAR(191) NOT NULL,
    `pageId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(1024) NOT NULL,
    `caption` TEXT NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `Photo_pageId_idx`(`pageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Buddy` ADD CONSTRAINT `Buddy_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Buddy` ADD CONSTRAINT `Buddy_addresseeId_fkey` FOREIGN KEY (`addresseeId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Trip` ADD CONSTRAINT `Trip_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripBuddy` ADD CONSTRAINT `TripBuddy_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TripBuddy` ADD CONSTRAINT `TripBuddy_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Destination` ADD CONSTRAINT `Destination_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Page` ADD CONSTRAINT `Page_tripId_fkey` FOREIGN KEY (`tripId`) REFERENCES `Trip`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Photo` ADD CONSTRAINT `Photo_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `Page`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

