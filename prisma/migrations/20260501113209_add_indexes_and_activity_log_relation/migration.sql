-- CreateIndex
CREATE INDEX "ActivityLog_companyId_idx" ON "ActivityLog"("companyId");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "Task_teamId_idx" ON "Task"("teamId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "Task_creatorId_idx" ON "Task"("creatorId");

-- CreateIndex
CREATE INDEX "TaskHistory_taskId_idx" ON "TaskHistory"("taskId");

-- CreateIndex
CREATE INDEX "Team_companyId_idx" ON "Team"("companyId");

-- CreateIndex
CREATE INDEX "Team_teamLeadId_idx" ON "Team"("teamLeadId");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
