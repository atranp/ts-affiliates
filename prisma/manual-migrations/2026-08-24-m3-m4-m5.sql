-- Applied to production Supabase on 2026-08-24.
-- Generated with: prisma migrate diff --from-url <prod> --to-schema-datamodel prisma/schema.prisma
-- Purely additive: no DROP, no ALTER COLUMN, no RENAME. Safe for the
-- previously-deployed code, which simply ignores the new columns.
BEGIN;

-- CreateEnum
CREATE TYPE "PayoutWriteBackStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SETTLED', 'FAILED');

-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN     "customSlug" TEXT,
ADD COLUMN     "referralUrl" TEXT,
ADD COLUMN     "storeCreditBalance" DECIMAL(12,2),
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "PayoutBatch" ADD COLUMN     "settledAmount" DECIMAL(12,2),
ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "slicewpPaymentId" INTEGER,
ADD COLUMN     "writeBackAttemptedAt" TIMESTAMP(3),
ADD COLUMN     "writeBackAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "writeBackError" TEXT,
ADD COLUMN     "writeBackStatus" "PayoutWriteBackStatus" NOT NULL DEFAULT 'NOT_REQUIRED';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "lastVisitSyncedThrough" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "slicewpId" INTEGER NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "landingUrl" TEXT,
    "referrerUrl" TEXT,
    "slicewpCommissionId" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creative" (
    "id" TEXT NOT NULL,
    "slicewpId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "imageUrl" TEXT,
    "altText" TEXT,
    "text" TEXT,
    "landingUrl" TEXT,
    "status" TEXT NOT NULL,
    "dateCreated" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Creative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCoupon" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "externalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "amount" TEXT,
    "uses" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Visit_slicewpId_key" ON "Visit"("slicewpId");

-- CreateIndex
CREATE INDEX "Visit_affiliateId_occurredAt_idx" ON "Visit"("affiliateId", "occurredAt");

-- CreateIndex
CREATE INDEX "Visit_occurredAt_idx" ON "Visit"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Creative_slicewpId_key" ON "Creative"("slicewpId");

-- CreateIndex
CREATE INDEX "Creative_status_idx" ON "Creative"("status");

-- CreateIndex
CREATE INDEX "AffiliateCoupon_affiliateId_idx" ON "AffiliateCoupon"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCoupon_origin_externalId_key" ON "AffiliateCoupon"("origin", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatch_slicewpPaymentId_key" ON "PayoutBatch"("slicewpPaymentId");

-- CreateIndex
CREATE INDEX "PayoutBatch_writeBackStatus_idx" ON "PayoutBatch"("writeBackStatus");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCoupon" ADD CONSTRAINT "AffiliateCoupon_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
