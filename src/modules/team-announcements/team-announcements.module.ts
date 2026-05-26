import { Module } from "@nestjs/common";
import { TeamAnnouncementsController } from "./team-announcements.controller";
import { TeamAnnouncementsService } from "./team-announcements.service";

@Module({
  controllers: [TeamAnnouncementsController],
  providers: [TeamAnnouncementsService],
})
export class TeamAnnouncementsModule {}
