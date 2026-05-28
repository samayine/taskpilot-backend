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

      // Auto-join every channel the user is a member of so they receive
      // newMessage events for any of them — not just the one they're
      // actively viewing. This keeps unread counts live across the sidebar.
      const channelIds = await this.chatService.listChannelIdsForUser(
        payload.sub,
        payload.companyId,
      );
      for (const id of channelIds) {
        await client.join(`channel:${id}`);
      }
      // Personal room so the gateway can target a single user (e.g. when a
      // DM channel is freshly created and we want to push it to the other
      // side's sidebar).
      await client.join(`user:${payload.sub}`);

      this.logger.log(
        `Chat client ${client.id} connected — user: ${payload.sub} (auto-joined ${channelIds.length} rooms)`,
      );
    } catch {
      this.logger.warn(`Chat client ${client.id} rejected — invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Chat client ${client.id} disconnected`);
  }

  /**
   * Client joins a channel room to receive real-time messages.
   * Membership is verified before granting access to the room.
   */
  @SubscribeMessage("joinChannel")
  async handleJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string },
  ) {
    if (!data?.channelId) return;

    const userId = client.data.userId;
    const companyId = client.data.companyId;

    // Verify the channel exists and belongs to this company
    const channel = await this.chatService.findChannelForGateway(
      data.channelId,
      companyId,
    );
    if (!channel) {
      return { event: "error", data: { message: "Channel not found" } };
    }

    // Verify the user is a member of this channel
    const isMember = await this.chatService.isChannelMember(
      data.channelId,
      userId,
    );
    if (!isMember) {
      return { event: "error", data: { message: "You are not a member of this channel" } };
    }

    await client.join(`channel:${data.channelId}`);
    this.logger.log(
      `User ${userId} joined channel room: ${data.channelId}`,
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Send failed";
      return { event: "error", data: { message: msg } };
    }
  }

  /**
   * Client signals typing in a channel. Relayed to other members only
   * (ephemeral — never persisted).
   */
  @SubscribeMessage("typing")
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string; isTyping: boolean },
  ) {
    if (!data?.channelId) return;
    // Name is resolved client-side from the channel member list.
    client.to(`channel:${data.channelId}`).emit("typing", {
      channelId: data.channelId,
      userId: client.data.userId,
      isTyping: !!data.isTyping,
    });
  }

  /**
   * Server-side: notify a user that a new channel was opened with them (e.g.
   * a freshly-created DM). The user joins the new channel's room so they
   * receive subsequent newMessage events without reconnecting.
   */
  notifyChannelOpened(userId: string, channelId: string, channel: unknown) {
    void this.server
      .in(`user:${userId}`)
      .socketsJoin(`channel:${channelId}`);
    this.server.to(`user:${userId}`).emit("channelOpened", channel);
  }

  /**
   * Utility: broadcast a payload to a channel room (called from controller for
   * REST-originated events: newMessage, messageEdited, messageDeleted,
   * reactionChanged).
   */
  broadcastToChannel(channelId: string, event: string, data: unknown) {
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
