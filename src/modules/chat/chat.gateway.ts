import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { Logger } from "@nestjs/common";
import { ChatService } from "./chat.service";

/**
 * WebSocket gateway for real-time chat messaging.
 *
 * Uses the /chat namespace to keep it separate from the notifications gateway.
 *
 * Flow:
 * 1. Client connects with JWT: io("http://localhost:8000/chat", { auth: { token: "Bearer xxx" } })
 * 2. Gateway validates the token on connection
 * 3. Client emits "joinChannel" with { channelId } to join a channel room
 * 4. Client emits "sendMessage" with { channelId, content }
 * 5. Gateway broadcasts "newMessage" to all members in the channel room
 */
@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/chat",
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Chat client ${client.id} rejected — no token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);

      // Attach user info to the socket
      client.data.userId = payload.sub;
      client.data.companyId = payload.companyId;
      client.data.role = payload.role;

      this.logger.log(
        `Chat client ${client.id} connected — user: ${payload.sub}`,
      );
    } catch (error) {
      this.logger.warn(`Chat client ${client.id} rejected — invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Chat client ${client.id} disconnected`);
  }

  /**
   * Client joins a channel room to receive real-time messages.
   */
  @SubscribeMessage("joinChannel")
  async handleJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string },
  ) {
    if (!data?.channelId) return;

    await client.join(`channel:${data.channelId}`);
    this.logger.log(
      `User ${client.data.userId} joined channel room: ${data.channelId}`,
    );

    return { event: "joinedChannel", data: { channelId: data.channelId } };
  }

  /**
   * Client sends a message to a channel.
   * The message is persisted via ChatService, then broadcast to the channel room.
   */
  @SubscribeMessage("sendMessage")
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string; content: string },
  ) {
    if (!data?.channelId || !data?.content) return;

    try {
      const message = await this.chatService.sendMessage(
        data.channelId,
        data.content,
        client.data.userId,
        client.data.companyId,
      );

      // Broadcast to all members in the channel room
      this.server.to(`channel:${data.channelId}`).emit("newMessage", message);

      return { event: "messageSent", data: message };
    } catch (error) {
      return { event: "error", data: { message: error.message } };
    }
  }

  /**
   * Utility: broadcast a message to a channel room (called from service).
   */
  broadcastToChannel(channelId: string, event: string, data: any) {
    this.server.to(`channel:${channelId}`).emit(event, data);
  }

  private extractToken(client: Socket): string | null {
    const authHeader =
      client.handshake?.auth?.token || client.handshake?.headers?.authorization;
    if (!authHeader) return null;

    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }

    return authHeader;
  }
}
