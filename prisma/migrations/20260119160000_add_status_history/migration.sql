-- CreateTable
CREATE TABLE "status_history" (
    "id" SERIAL NOT NULL,
    "applicationId" TEXT NOT NULL,
    "statusType" TEXT NOT NULL,
    "oldStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "status_history_applicationId_idx" ON "status_history"("applicationId");

-- CreateIndex
CREATE INDEX "status_history_applicationId_createdAt_idx" ON "status_history"("applicationId", "createdAt");
