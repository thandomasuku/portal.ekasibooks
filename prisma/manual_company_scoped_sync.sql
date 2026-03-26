CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- DropIndex
DROP INDEX IF EXISTS "Quote_userId_deletedAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "Quote_userId_number_idx";

-- DropIndex
DROP INDEX IF EXISTS "Quote_userId_updatedAt_idx";

-- AlterTable
ALTER TABLE "Customer"
ADD COLUMN "companyId" TEXT,
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Quote"
ADD COLUMN "companyId" TEXT;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- Backfill: create one default company per existing user
INSERT INTO "Company" ("id", "userId", "name", "isActive", "isDefault", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  u."id",
  COALESCE(u."companyName", 'Default Company'),
  true,
  true,
  NOW(),
  NOW()
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1
  FROM "Company" c
  WHERE c."userId" = u."id"
);

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyName" TEXT,
    "tradingName" TEXT,
    "registrationNo" TEXT,
    "vatNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "suburb" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "currency" TEXT DEFAULT 'ZAR',
    "vatRateDefault" DECIMAL(8,2),
    "quotePrefix" TEXT,
    "invoicePrefix" TEXT,
    "quoteTerms" TEXT,
    "invoiceTerms" TEXT,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNo" TEXT,
    "bankBranchCode" TEXT,
    "bankAccountType" TEXT,
    "logoUrl" TEXT,
    "accentColor" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT,
    "issueDate" TEXT NOT NULL,
    "dueDate" TEXT,
    "paidDate" TEXT,
    "reference" TEXT,
    "publicComments" TEXT,
    "internalNotes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "vatRate" DECIMAL(8,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "vat" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "balance" DECIMAL(18,2),
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- Backfill existing customer rows with the user's default company
UPDATE "Customer" c
SET "companyId" = comp."id"
FROM "Company" comp
WHERE comp."userId" = c."userId"
  AND comp."isDefault" = true
  AND c."companyId" IS NULL;

-- Backfill existing quote rows with the user's default company
UPDATE "Quote" q
SET "companyId" = comp."id"
FROM "Company" comp
WHERE comp."userId" = q."userId"
  AND comp."isDefault" = true
  AND q."companyId" IS NULL;

-- Now enforce NOT NULL safely
ALTER TABLE "Customer"
ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "Quote"
ALTER COLUMN "companyId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Company_userId_idx" ON "Company"("userId");

-- CreateIndex
CREATE INDEX "Company_userId_isActive_idx" ON "Company"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Company_userId_deletedAt_idx" ON "Company"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Company_userId_isDefault_idx" ON "Company"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Company_userId_id_key" ON "Company"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySettings_companyId_key" ON "CompanySettings"("companyId");

-- CreateIndex
CREATE INDEX "CompanySettings_userId_idx" ON "CompanySettings"("userId");

-- CreateIndex
CREATE INDEX "CompanySettings_userId_companyId_idx" ON "CompanySettings"("userId", "companyId");

-- CreateIndex
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_idx" ON "Invoice"("companyId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_updatedAt_idx" ON "Invoice"("companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "Invoice_companyId_deletedAt_idx" ON "Invoice"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Invoice_companyId_number_idx" ON "Invoice"("companyId", "number");

-- CreateIndex
CREATE INDEX "Invoice_companyId_customerId_idx" ON "Invoice"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "Invoice_userId_companyId_idx" ON "Invoice"("userId", "companyId");

-- CreateIndex
CREATE INDEX "Customer_userId_idx" ON "Customer"("userId");

-- CreateIndex
CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");

-- CreateIndex
CREATE INDEX "Customer_companyId_updatedAt_idx" ON "Customer"("companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "Customer_companyId_deletedAt_idx" ON "Customer"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Customer_userId_companyId_idx" ON "Customer"("userId", "companyId");

-- CreateIndex
CREATE INDEX "Quote_companyId_idx" ON "Quote"("companyId");

-- CreateIndex
CREATE INDEX "Quote_companyId_updatedAt_idx" ON "Quote"("companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "Quote_companyId_deletedAt_idx" ON "Quote"("companyId", "deletedAt");

-- CreateIndex
CREATE INDEX "Quote_companyId_number_idx" ON "Quote"("companyId", "number");

-- CreateIndex
CREATE INDEX "Quote_companyId_customerId_idx" ON "Quote"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "Quote_userId_companyId_idx" ON "Quote"("userId", "companyId");

-- AddForeignKey
ALTER TABLE "Company"
ADD CONSTRAINT "Company_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySettings"
ADD CONSTRAINT "CompanySettings_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySettings"
ADD CONSTRAINT "CompanySettings_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer"
ADD CONSTRAINT "Customer_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer"
ADD CONSTRAINT "Customer_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote"
ADD CONSTRAINT "Quote_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote"
ADD CONSTRAINT "Quote_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;