-- AlterTable
ALTER TABLE "ChatChannel" ADD COLUMN "teamId" TEXT;

-- AlterTable
ALTER TABLE "ChatChannelMember" ADD COLUMN "lastReadAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ChatChannel_teamId_idx" ON "ChatChannel"("teamId");

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
