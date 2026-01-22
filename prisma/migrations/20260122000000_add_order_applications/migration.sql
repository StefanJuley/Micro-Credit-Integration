-- CreateTable
CREATE TABLE "order_applications" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "creditCompany" TEXT NOT NULL,
    "bankStatus" TEXT,
    "crmStatus" TEXT,
    "customerName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "order_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_applications_applicationId_key" ON "order_applications"("applicationId");

-- CreateIndex
CREATE INDEX "order_applications_orderId_idx" ON "order_applications"("orderId");

-- CreateIndex
CREATE INDEX "order_applications_isActive_idx" ON "order_applications"("isActive");

-- CreateIndex
CREATE INDEX "order_applications_orderId_isActive_idx" ON "order_applications"("orderId", "isActive");
