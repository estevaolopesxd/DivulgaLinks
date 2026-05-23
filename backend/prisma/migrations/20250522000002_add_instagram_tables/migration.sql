-- CreateEnum
CREATE TYPE "InstagramPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');
CREATE TYPE "InstagramMediaType" AS ENUM ('IMAGE', 'REEL', 'CAROUSEL', 'STORY');

-- CreateTable instagram_accounts
CREATE TABLE IF NOT EXISTS "instagram_accounts" (
    "id" TEXT NOT NULL,
    "instagramUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "profilePictureUrl" TEXT,
    "pageId" TEXT,
    "pageName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "instagram_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "instagram_accounts_instagramUserId_key" ON "instagram_accounts"("instagramUserId");

-- CreateTable instagram_posts
CREATE TABLE IF NOT EXISTS "instagram_posts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "mediaType" "InstagramMediaType" NOT NULL DEFAULT 'IMAGE',
    "mediaUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "caption" TEXT,
    "hashtags" TEXT,
    "status" "InstagramPostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "igMediaId" TEXT,
    "failedReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "instagram_posts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "instagram_posts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
