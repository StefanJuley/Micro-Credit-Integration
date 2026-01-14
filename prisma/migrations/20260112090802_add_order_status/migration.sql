-- AlterTable
ALTER TABLE "feed_items" ADD COLUMN     "orderStatus" TEXT;

-- CreateIndex
CREATE INDEX "feed_items_orderStatus_idx" ON "feed_items"("orderStatus");
