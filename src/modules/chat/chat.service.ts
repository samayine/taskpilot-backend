import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateChannelDto } from "./dto/create-channel.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import { ChannelType, Role } from "@prisma/client";

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

  async findUserChannels(
    userId: string,
    companyId: string,
    pagination: PaginationDto,
  ) {
    const where = {
      companyId,
      members: { some: { userId } },
    };

    const [channels, total] = await Promise.all([
      this.prisma.chatChannel.findMany({
        where,
        include: {
          _count: { select: { messages: true, members: true } },
          project: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              createdAt: true,
              senderId: true,
              sender: { select: { id: true, fullName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prisma.chatChannel.count({ where }),
    ]);

    // Compute unread count per channel (messages newer than the caller's
    // lastReadAt that they did not send). A per-channel `count` is fine at
    // this scale; revisit with a single grouped query if the channel list
    // ever grows large.
    const enriched = await Promise.all(
      channels.map(async (c) => {
        const me = c.members.find((m) => m.userId === userId);
        const unreadCount = await this.prisma.chatMessage.count({
          where: {
            channelId: c.id,
            senderId: { not: userId },
            ...(me?.lastReadAt
              ? { createdAt: { gt: me.lastReadAt } }
              : {}),
          },
        });
        const lastMessage = c.messages[0] ?? null;
        const { messages: _msgs, ...rest } = c;
        return { ...rest, lastMessage, unreadCount };
      }),
    );

    return paginate(enriched, total, pagination);
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
  // Gateway helpers (called from ChatGateway)
  // ──────────────────────────────────────────────

  async findChannelForGateway(channelId: string, companyId: string) {
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: channelId },
    });
    return channel && channel.companyId === companyId ? channel : null;
  }

  async isChannelMember(channelId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    return !!membership;
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

  // ──────────────────────────────────────────────
  // Team-scoped channel (project hub chat)
  // ──────────────────────────────────────────────

  /** Verify the caller is a viewer of the given team (CEO, lead, dept-head, or
   *  team member). Returns the team. */
  private async assertTeamViewer(
    teamId: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        companyId: true,
        name: true,
        teamLeadId: true,
        departmentId: true,
        isShared: true,
      },
    });
    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }
    if (role === Role.CEO) return team;
    if (team.teamLeadId === userId) return team;
    if (role === Role.DEPARTMENT_HEAD) {
      const headed = await this.prisma.department.findMany({
        where: { headId: userId, companyId },
        select: { id: true },
      });
      const ids = new Set(headed.map((d) => d.id));
      const ok = team.isShared
        ? (
            await this.prisma.teamDepartment.findMany({
              where: { teamId: team.id },
              select: { departmentId: true },
            })
          ).some((sd) => ids.has(sd.departmentId))
        : !!team.departmentId && ids.has(team.departmentId);
      if (ok) return team;
    }
    const member = await this.prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (member) return team;
    throw new ForbiddenException("You do not have access to this team");
  }

  /**
   * Get-or-create the chat channel for a team's project hub. Lazy-adds the
   * caller (and the team lead) as channel members if not already present.
   */
  async getOrCreateTeamChannel(
    teamId: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    const team = await this.assertTeamViewer(teamId, userId, role, companyId);

    let channel = await this.prisma.chatChannel.findFirst({
      where: { teamId, type: ChannelType.PROJECT, companyId },
    });

    if (!channel) {
      // Seed the channel with every current team member (and the lead).
      const teamMembers = await this.prisma.teamMember.findMany({
        where: { teamId },
        select: { userId: true },
      });
      const memberUserIds = new Set<string>(teamMembers.map((m) => m.userId));
      memberUserIds.add(team.teamLeadId);
      memberUserIds.add(userId);
      channel = await this.prisma.chatChannel.create({
        data: {
          name: team.name,
          type: ChannelType.PROJECT,
          teamId,
          companyId,
          members: {
            create: Array.from(memberUserIds).map((uid) => ({ userId: uid })),
          },
        },
      });
    } else {
      // Ensure the caller is a member (lazy-join for newer team members).
      const existing = await this.prisma.chatChannelMember.findUnique({
        where: { channelId_userId: { channelId: channel.id, userId } },
      });
      if (!existing) {
        await this.prisma.chatChannelMember.create({
          data: { channelId: channel.id, userId },
        });
      }
    }

    return this.prisma.chatChannel.findUnique({
      where: { id: channel.id },
      include: {
        team: { select: { id: true, name: true } },
        members: {
          include: {
            user: {
              select: { id: true, fullName: true, email: true, role: true },
            },
          },
        },
        _count: { select: { messages: true, members: true } },
      },
    });
  }

  // ──────────────────────────────────────────────
  // Direct messages (1:1)
  // ──────────────────────────────────────────────

  /** Whether the caller is allowed to DM the target user. */
  private canDm(callerRole: Role, targetRole: Role): boolean {
    // ASSISTANT may only DM the CEO. Everyone else may DM anyone in the
    // company (the company-scope check is enforced separately).
    if (callerRole === Role.ASSISTANT && targetRole !== Role.CEO) return false;
    return true;
  }

  /** Get-or-create a DIRECT channel between the caller and a target user. */
  async getOrCreateDirectChannel(
    callerId: string,
    callerRole: Role,
    targetUserId: string,
    companyId: string,
  ) {
    if (callerId === targetUserId) {
      throw new ConflictException("You cannot message yourself");
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, companyId: true, role: true, fullName: true },
    });
    if (!target || target.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }
    if (!this.canDm(callerRole, target.role)) {
      throw new ForbiddenException(
        "You can only message the CEO",
      );
    }

    // Find an existing 1:1 channel between exactly these two users.
    const candidates = await this.prisma.chatChannel.findMany({
      where: {
        companyId,
        type: ChannelType.DIRECT,
        AND: [
          { members: { some: { userId: callerId } } },
          { members: { some: { userId: targetUserId } } },
        ],
      },
      include: { members: { select: { userId: true } } },
    });
    const exact = candidates.find((c) => c.members.length === 2);

    const channelId =
      exact?.id ??
      (
        await this.prisma.chatChannel.create({
          data: {
            // Display name is computed client-side from the other member;
            // the persisted name is just a stable label for logs.
            name: `DM`,
            type: ChannelType.DIRECT,
            companyId,
            members: {
              create: [{ userId: callerId }, { userId: targetUserId }],
            },
          },
          select: { id: true },
        })
      ).id;

    return this.prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, fullName: true, email: true, role: true },
            },
          },
        },
        _count: { select: { messages: true, members: true } },
      },
    });
  }

  /** Users the caller may DM. ASSISTANT only sees the CEO; everyone else sees
   *  all other users in the company. */
  async getDmableUsers(callerId: string, callerRole: Role, companyId: string) {
    const where =
      callerRole === Role.ASSISTANT
        ? { companyId, role: Role.CEO }
        : { companyId, NOT: { id: callerId } };
    return this.prisma.user.findMany({
      where,
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: "asc" },
    });
  }

  // ──────────────────────────────────────────────
  // Mark a channel read
  // ──────────────────────────────────────────────

  async markChannelRead(channelId: string, userId: string, companyId: string) {
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: channelId },
      select: { id: true, companyId: true },
    });
    if (!channel || channel.companyId !== companyId) {
      throw new NotFoundException("Channel not found");
    }
    const member = await this.prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member) {
      throw new ForbiddenException("You are not a member of this channel");
    }
    await this.prisma.chatChannelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: { lastReadAt: new Date() },
    });
    return { message: "Channel marked read" };
  }

  /** Gateway helper: returns the channel ids a user is a member of (for room
   *  auto-join on socket connection). */
  async listChannelIdsForUser(userId: string, companyId: string) {
    const memberships = await this.prisma.chatChannelMember.findMany({
      where: { userId, channel: { companyId } },
      select: { channelId: true },
    });
    return memberships.map((m) => m.channelId);
  }
}
