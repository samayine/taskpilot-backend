import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ChatService } from "./chat.service";
import { ChatController } from "./chat.controller";
import { ChatGateway } from "./chat.gateway";

@Module({
  imports: [
    // Gateway needs JwtService to validate tokens on WebSocket connection
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: "1d" },
    }),
  ],
  providers: [ChatGateway, ChatService],
  controllers: [ChatController],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
