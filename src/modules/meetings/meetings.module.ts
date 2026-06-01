import { Module } from "@nestjs/common";
import { MeetingsService } from "./meetings.service";
import { MeetingsController } from "./meetings.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  providers: [MeetingsService],
  controllers: [MeetingsController],
})
export class MeetingsModule {}
