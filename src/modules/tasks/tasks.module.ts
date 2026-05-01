import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { TasksController } from "./tasks.controller";
import { NotificationsModule } from "../notifications/notifications.module";
import { TaskHistoryModule } from "../task-history/task-history.module";

@Module({
  imports: [NotificationsModule, TaskHistoryModule],
  providers: [TasksService],
  controllers: [TasksController],
  exports: [TasksService],
})
export class TasksModule {}
