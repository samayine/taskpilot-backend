import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationType } from "@prisma/client";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Create a notification in the database and push it via WebSocket.
   */
  async notify(
    userId: string,
    type: NotificationType,
    message: string,
    taskId?: string,
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        message,
        taskId: taskId ?? null,
      },
    });

    // Push in real-time via WebSocket
    this.gateway.sendToUser(userId, notification);

    return notification;
  }

  /**
   * Get all notifications for a user (newest first).
   */
  async findAllForUser(userId: string, pagination: PaginationDto) {
    const where = { userId };

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prisma.notification.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  /**
   * Get unread count for a user.
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { unreadCount: count };
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
