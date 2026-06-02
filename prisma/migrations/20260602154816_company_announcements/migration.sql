-- CreateTable
CREATE TABLE "CompanyAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "CompanyAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyAnnouncement_companyId_createdAt_idx" ON "CompanyAnnouncement"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyAnnouncement_authorId_idx" ON "CompanyAnnouncement"("authorId");

-- AddForeignKey
ALTER TABLE "CompanyAnnouncement" ADD CONSTRAINT "CompanyAnnouncement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAnnouncement" ADD CONSTRAINT "CompanyAnnouncement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
