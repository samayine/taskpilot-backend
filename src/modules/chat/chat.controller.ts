import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { ChatService } from "./chat.service";
import { ChatGateway } from "./chat.gateway";
import { CreateChannelDto } from "./dto/create-channel.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { AddChannelMemberDto } from "./dto/add-channel-member.dto";
import { OpenDirectDto } from "./dto/open-direct.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@ApiTags("Chat")
@ApiBearerAuth("JWT")
@Controller("chat")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  /** CEO, DEPARTMENT_HEAD, or TEAM_LEAD creates a chat channel. */
  @ApiOperation({ summary: "CEO, DEPARTMENT_HEAD, or TEAM_LEAD creates a chat channel." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Post("channels")
  createChannel(@Body() dto: CreateChannelDto, @Request() req) {
    return this.chatService.createChannel(
      dto,
      req.user.companyId,
      req.user.userId,
    );
  }

  /** Any authenticated user lists channels they belong to. */
  @ApiOperation({ summary: "Any authenticated user lists channels they belong to." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE, Role.ASSISTANT)
  @Get("channels")
  findChannels(@Query() pagination: PaginationDto, @Request() req) {
    return this.chatService.findUserChannels(
      req.user.userId,
      req.user.companyId,
      pagination,
    );
  }

  /** Channel member gets paginated messages. */
  @ApiOperation({ summary: "Channel member gets paginated messages." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE, Role.ASSISTANT)
  @Get("channels/:id/messages")
  getMessages(
    @Param("id") channelId: string,
    @Query() pagination: PaginationDto,
    @Request() req,
  ) {
    return this.chatService.getMessages(
      channelId,
      req.user.userId,
      req.user.companyId,
      pagination,
    );
  }

  /** Channel member sends a message (REST fallback — prefer WebSocket). */
  @ApiOperation({ summary: "Channel member sends a message (REST fallback — prefer WebSocket)." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE, Role.ASSISTANT)
  @Post("channels/:id/messages")
  sendMessage(
    @Param("id") channelId: string,
    @Body() dto: SendMessageDto,
    @Request() req,
  ) {
    return this.chatService.sendMessage(
      channelId,
      dto.content,
      req.user.userId,
      req.user.companyId,
    );
  }

  /** Channel member adds another user to the channel. */
  @ApiOperation({ summary: "Channel member adds another user to the channel." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Post("channels/:id/members")
  addMember(
    @Param("id") channelId: string,
    @Body() dto: AddChannelMemberDto,
    @Request() req,
  ) {
    return this.chatService.addMember(
      channelId,
      dto.userId,
      req.user.userId,
      req.user.companyId,
    );
  }

  /** Mark a channel as read (resets the caller's unread count). */
  @ApiOperation({ summary: "Mark a channel as read for the caller." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE, Role.ASSISTANT)
  @Patch("channels/:id/read")
  markRead(@Param("id") channelId: string, @Request() req) {
    return this.chatService.markChannelRead(
      channelId,
      req.user.userId,
      req.user.companyId,
    );
  }

  /** Get-or-create a direct (1:1) message channel with another user. */
  @ApiOperation({ summary: "Get-or-create a direct message channel with another user." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE, Role.ASSISTANT)
  @Post("dms")
  async openDirect(@Body() dto: OpenDirectDto, @Request() req) {
    const channel = await this.chatService.getOrCreateDirectChannel(
      req.user.userId,
      req.user.role,
      dto.userId,
      req.user.companyId,
    );
    // Push the new channel to the other party's sidebar (and ensure their
    // socket joins the channel room so live messages flow without refresh).
    if (channel) {
      this.chatGateway.notifyChannelOpened(dto.userId, channel.id, channel);
    }
    return channel;
  }

  /** List users the caller is allowed to DM. */
  @ApiOperation({ summary: "List users the caller is allowed to DM." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE, Role.ASSISTANT)
  @Get("dms/users")
  dmableUsers(@Request() req) {
    return this.chatService.getDmableUsers(
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }

  /** Get-or-create the chat channel for a team's project hub. */
  @ApiOperation({ summary: "Get-or-create the team's project-hub chat channel." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE, Role.ASSISTANT)
  @Get("teams/:teamId/channel")
  teamChannel(@Param("teamId") teamId: string, @Request() req) {
    return this.chatService.getOrCreateTeamChannel(
      teamId,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }
}
