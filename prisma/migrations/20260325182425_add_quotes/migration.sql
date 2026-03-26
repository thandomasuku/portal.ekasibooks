-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT,
    "issueDate" TEXT NOT NULL,
    "expiryDate" TEXT,
    "dueDate" TEXT,
    "reference" TEXT,
    "publicComments" TEXT,
    "internalNotes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "vatRate" DECIMAL(8,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "vat" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Quote_userId_idx" ON "Quote"("userId");

-- CreateIndex
CREATE INDEX "Quote_userId_updatedAt_idx" ON "Quote"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Quote_userId_deletedAt_idx" ON "Quote"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Quote_userId_number_idx" ON "Quote"("userId", "number");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
