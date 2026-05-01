import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { Logger } from "@nestjs/common";

/**
 * WebSocket gateway for real-time notifications.
 *
 * How it works:
 * 1. Client connects with JWT: io("http://localhost:8000", { auth: { token: "Bearer xxx" } })
 * 2. Gateway validates the token on connection
 * 3. Client is automatically joined to a personal room: `user:<userId>`
 * 4. When a notification is created, the service emits to that room
 */
@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/notifications",
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Client ${client.id} rejected — no token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);

      // Attach user info to the socket for later use
      client.data.userId = payload.sub;
      client.data.companyId = payload.companyId;
      client.data.role = payload.role;

      // Join a personal room so we can send targeted notifications
      await client.join(`user:${payload.sub}`);

      this.logger.log(
        `Client ${client.id} connected — user: ${payload.sub}, role: ${payload.role}`,
      );
    } catch (error) {
      this.logger.warn(`Client ${client.id} rejected — invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  /**
   * Send a notification event to a specific user.
   * Called by NotificationsService after persisting the notification.
   */
  sendToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit("notification", notification);
  }

  private extractToken(client: Socket): string | null {
    const authHeader =
      client.handshake?.auth?.token || client.handshake?.headers?.authorization;
    if (!authHeader) return null;

    // Support both "Bearer xxx" and raw token
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }

    return authHeader;
  }
}
