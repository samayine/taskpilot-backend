import { Module } from "@nestjs/common";
import { TaskHistoryService } from "./task-history.service";

@Module({
  providers: [TaskHistoryService],
  exports: [TaskHistoryService],
})
export class TaskHistoryModule {}
