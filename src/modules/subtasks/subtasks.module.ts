import { Module } from "@nestjs/common";
import { SubtasksController } from "./subtasks.controller";
import { SubtasksService } from "./subtasks.service";

@Module({
  controllers: [SubtasksController],
  providers: [SubtasksService],
})
export class SubtasksModule {}
