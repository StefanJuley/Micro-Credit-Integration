-- CreateTable
CREATE TABLE "application_requests" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "applicationId" TEXT NOT NULL,
    "creditCompany" TEXT NOT NULL,
    "requestData" JSONB NOT NULL,
    "filesCount" INTEGER NOT NULL DEFAULT 0,
    "fileNames" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "application_requests_applicationId_key" ON "application_requests"("applicationId");

-- CreateIndex
CREATE INDEX "application_requests_orderId_idx" ON "application_requests"("orderId");

-- CreateIndex
CREATE INDEX "application_requests_applicationId_idx" ON "application_requests"("applicationId");

-- CreateIndex
CREATE INDEX "application_requests_creditCompany_idx" ON "application_requests"("creditCompany");
