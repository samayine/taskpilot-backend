-- AlterTable
ALTER TABLE "Document" ADD COLUMN "teamId" TEXT;

-- CreateIndex
CREATE INDEX "Document_teamId_idx" ON "Document"("teamId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
