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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    PrismaModule,
    ActivityLogModule,
    UsersModule,
    AuthModule,
    TeamsModule,
    TasksModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

