import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./modules/users/users.module";
import { AuthModule } from "./modules/auth/auth.module";
import { TeamsModule } from "./modules/teams/teams.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ActivityLogModule } from "./modules/activity-log/activity-log.module";
import { CompanyModule } from "./modules/company/company.module";
import { CommentsModule } from "./modules/comments/comments.module";
import { SubtasksModule } from "./modules/subtasks/subtasks.module";
import { AttachmentsModule } from "./modules/attachments/attachments.module";
import { LabelsModule } from "./modules/labels/labels.module";
import { DepartmentsModule } from "./modules/departments/departments.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { ChatModule } from "./modules/chat/chat.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { TeamAnnouncementsModule } from "./modules/team-announcements/team-announcements.module";
import { MeModule } from "./modules/me/me.module";
import { MailModule } from "./modules/mail/mail.module";
import { MeetingsModule } from "./modules/meetings/meetings.module";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60000,  // 1 minute window
        limit: 60,   // 60 requests per minute per IP
      },
    ]),
    PrismaModule,
    MailModule,
    ActivityLogModule,
    CompanyModule,
    UsersModule,
    AuthModule,
    TeamsModule,
    TasksModule,
    NotificationsModule,
    CommentsModule,
    SubtasksModule,
    AttachmentsModule,
    LabelsModule,
    DepartmentsModule,
    ProjectsModule,
    ChatModule,
    DocumentsModule,
    TeamAnnouncementsModule,
    MeModule,
    MeetingsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

