import { Module } from "@nestjs/common";

import { AnnouncementsController } from "./announcements.controller";
import { AnnouncementsService } from "./announcements.service";

// ActivityLogModule is @Global — no need to import it explicitly.
@Module({
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
