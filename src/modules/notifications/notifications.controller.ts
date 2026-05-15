import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { PaginationDto } from "src/common/dto/pagination.dto";

@ApiTags("Notifications")
@ApiBearerAuth("JWT")
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Get all notifications for the current user. */
  @ApiOperation({ summary: "Get all notifications for the current user." })
  @Get()
  findAll(@Query() pagination: PaginationDto, @Request() req) {
    return this.notificationsService.findAllForUser(req.user.userId, pagination);
  }

  /** Get unread notification count. */
  @ApiOperation({ summary: "Get unread notification count." })
  @Get("unread-count")
  getUnreadCount(@Request() req) {
    return this.notificationsService.getUnreadCount(req.user.userId);
  }

  /** Mark a single notification as read. */
  @ApiOperation({ summary: "Mark a single notification as read." })
  @Patch(":id/read")
  markAsRead(@Param("id") id: string, @Request() req) {
    return this.notificationsService.markAsRead(id, req.user.userId);
  }

  /** Mark all notifications as read. */
  @ApiOperation({ summary: "Mark all notifications as read." })
  @Patch("read-all")
  markAllAsRead(@Request() req) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }
}
