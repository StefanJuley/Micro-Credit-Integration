-- CreateTable
CREATE TABLE "feed_items" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "creditCompany" TEXT,
    "customerName" TEXT NOT NULL,
    "bankStatus" TEXT NOT NULL,
    "crmStatus" TEXT,
    "paymentType" TEXT,
    "conditionsChanged" BOOLEAN NOT NULL DEFAULT false,
    "comparison" JSONB,
    "orderCreatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_metadata" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feed_items_orderId_key" ON "feed_items"("orderId");

-- CreateIndex
CREATE INDEX "feed_items_bankStatus_idx" ON "feed_items"("bankStatus");

-- CreateIndex
CREATE INDEX "feed_items_conditionsChanged_idx" ON "feed_items"("conditionsChanged");

-- CreateIndex
CREATE INDEX "feed_items_creditCompany_idx" ON "feed_items"("creditCompany");

-- CreateIndex
CREATE UNIQUE INDEX "sync_metadata_key_key" ON "sync_metadata"("key");
