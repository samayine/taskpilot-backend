import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateChannelDto } from "./dto/create-channel.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import { ChannelType } from "@prisma/client";

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // Create a chat channel
  // ──────────────────────────────────────────────

  async createChannel(
    dto: CreateChannelDto,
    companyId: string,
    userId: string,
  ) {
    // If project-linked, validate the project exists
    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
      });
      if (!project || project.companyId !== companyId) {
        throw new NotFoundException("Project not found");
      }
    }

    const channel = await this.prisma.chatChannel.create({
      data: {
        name: dto.name,
        type: dto.type ?? ChannelType.PROJECT,
        projectId: dto.projectId,
        companyId,
        // Auto-add creator as first member
        members: {
          create: { userId },
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
        project: { select: { id: true, name: true } },
      },
    });

    return channel;
  }

  // ──────────────────────────────────────────────
  // List channels the user belongs to
  // ──────────────────────────────────────────────

  async findUserChannels(userId: string, companyId: string, pagination: PaginationDto) {
    const where = {
      companyId,
      members: { some: { userId } },
    };

    const [data, total] = await Promise.all([
      this.prisma.chatChannel.findMany({
        where,
        include: {
          _count: { select: { messages: true, members: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prisma.chatChannel.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  // ──────────────────────────────────────────────
  // Get messages for a channel (paginated)
  // ──────────────────────────────────────────────

  async getMessages(
    channelId: string,
    userId: string,
    companyId: string,
    pagination: PaginationDto,
  ) {
    // Verify channel exists and user is a member
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel || channel.companyId !== companyId) {
      throw new NotFoundException("Channel not found");
    }

    const membership = await this.prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this channel");
    }

    const where = { channelId };

    const [data, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where,
        include: {
          sender: { select: { id: true, fullName: true, email: true } },
          documents: {
            include: {
              document: {
                select: { id: true, fileName: true, fileUrl: true, mimeType: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prisma.chatMessage.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  // ──────────────────────────────────────────────
  // Send a message in a channel
  // ──────────────────────────────────────────────

  async sendMessage(
    channelId: string,
    content: string,
    userId: string,
    companyId: string,
  ) {
    // Verify channel exists
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel || channel.companyId !== companyId) {
      throw new NotFoundException("Channel not found");
    }

    // Verify user is a member
    const membership = await this.prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this channel");
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        content,
        channelId,
        senderId: userId,
      },
      include: {
        sender: { select: { id: true, fullName: true, email: true } },
      },
    });

    return message;
  }

  // ──────────────────────────────────────────────
  // Add a member to a channel
  // ──────────────────────────────────────────────

  async addMember(
    channelId: string,
    targetUserId: string,
    callerId: string,
    companyId: string,
  ) {
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel || channel.companyId !== companyId) {
      throw new NotFoundException("Channel not found");
    }

    // Verify caller is a member of this channel
    const callerMembership = await this.prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId: callerId } },
    });

    if (!callerMembership) {
      throw new ForbiddenException("You are not a member of this channel");
    }

    // Verify target user exists and belongs to the same company
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser || targetUser.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }

    // Check if already a member
    const existing = await this.prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId: targetUserId } },
    });

    if (existing) {
      throw new ConflictException("User is already a member of this channel");
    }

    return this.prisma.chatChannelMember.create({
      data: { channelId, userId: targetUserId },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
  }
}
