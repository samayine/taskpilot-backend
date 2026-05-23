import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";

@Module({
  imports: [ConfigModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
