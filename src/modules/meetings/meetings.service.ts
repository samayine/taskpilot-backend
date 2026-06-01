import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MeetingRsvp,
  MeetingScope,
  MeetingStatus,
  NotificationType,
  Prisma,
  Role,
} from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginate, paginateArgs } from "src/common/helpers/pagination.helper";
import { CreateMeetingDto } from "./dto/create-meeting.dto";
import { UpdateMeetingDto } from "./dto/update-meeting.dto";

const MEETING_INCLUDE = {
  host: { select: { id: true, fullName: true, email: true, role: true } },
  createdBy: { select: { id: true, fullName: true, email: true, role: true } },
  targetDepartment: { select: { id: true, name: true } },
  targetTeam: { select: { id: true, name: true } },
  participants: {
    include: {
      user: { select: { id: true, fullName: true, email: true, role: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  },
} satisfies Prisma.MeetingInclude;

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ──────────────────────────────────────────────
  // Permission helpers
  // ──────────────────────────────────────────────

  /** Whether the caller is allowed to CREATE a meeting in the given scope. */
  private async assertCanCreate(
    dto: CreateMeetingDto,
    userId: string,
    role: Role,
    companyId: string,
  ): Promise<void> {
    switch (dto.scope) {
      case MeetingScope.COMPANY:
      case MeetingScope.ROLE:
        if (role !== Role.CEO) {
          throw new ForbiddenException(
            "Only the CEO can call company-wide or role-targeted meetings",
          );
        }
        if (dto.scope === MeetingScope.ROLE && !dto.targetRole) {
          throw new BadRequestException("targetRole is required for ROLE scope");
        }
        return;
      case MeetingScope.DEPARTMENT: {
        if (!dto.targetDepartmentId)
          throw new BadRequestException(
            "targetDepartmentId is required for DEPARTMENT scope",
          );
        const dept = await this.prisma.department.findUnique({
          where: { id: dto.targetDepartmentId },
        });
        if (!dept || dept.companyId !== companyId)
          throw new NotFoundException("Department not found");
        if (role === Role.CEO) return;
        if (role === Role.DEPARTMENT_HEAD && dept.headId === userId) return;
        throw new ForbiddenException(
          "Only the CEO or this department's head can call this meeting",
        );
      }
      case MeetingScope.TEAM: {
        if (!dto.targetTeamId)
          throw new BadRequestException(
            "targetTeamId is required for TEAM scope",
          );
        const team = await this.prisma.team.findUnique({
          where: { id: dto.targetTeamId },
          select: {
            id: true,
            companyId: true,
            teamLeadId: true,
            departmentId: true,
            isShared: true,
          },
        });
        if (!team || team.companyId !== companyId)
          throw new NotFoundException("Team not found");
        if (role === Role.CEO) return;
        if (role === Role.TEAM_LEAD && team.teamLeadId === userId) return;
        if (role === Role.DEPARTMENT_HEAD) {
          const headed = await this.prisma.department.findMany({
            where: { headId: userId, companyId },
            select: { id: true },
          });
          const ids = new Set(headed.map((d) => d.id));
          if (!team.isShared && team.departmentId && ids.has(team.departmentId))
            return;
          if (team.isShared) {
            const shared = await this.prisma.teamDepartment.findMany({
              where: { teamId: team.id },
              select: { departmentId: true },
            });
            if (shared.some((s) => ids.has(s.departmentId))) return;
          }
        }
        throw new ForbiddenException(
          "Only the CEO, the team lead, or the team's department head can call this meeting",
        );
      }
    }
  }

  /** Resolve the participant set for a meeting from its scope + targets. */
  private async resolveParticipants(
    dto: Pick<
      CreateMeetingDto,
      "scope" | "targetRole" | "targetDepartmentId" | "targetTeamId"
    >,
    hostId: string,
    companyId: string,
  ): Promise<string[]> {
    const ids = new Set<string>();
    ids.add(hostId); // host is always a participant (auto-accepted later)

    if (dto.scope === MeetingScope.COMPANY) {
      const users = await this.prisma.user.findMany({
        where: { companyId, isBlocked: false },
        select: { id: true },
      });
      users.forEach((u) => ids.add(u.id));
    } else if (dto.scope === MeetingScope.ROLE && dto.targetRole) {
      const users = await this.prisma.user.findMany({
        where: { companyId, role: dto.targetRole, isBlocked: false },
        select: { id: true },
      });
      users.forEach((u) => ids.add(u.id));
    } else if (
      dto.scope === MeetingScope.DEPARTMENT &&
      dto.targetDepartmentId
    ) {
      const dept = await this.prisma.department.findUnique({
        where: { id: dto.targetDepartmentId },
        include: {
          members: { select: { id: true, isBlocked: true } },
        },
      });
      dept?.members
        .filter((m) => !m.isBlocked)
        .forEach((m) => ids.add(m.id));
      if (dept?.headId) ids.add(dept.headId);
      // Include team leads of every team in the department.
      const teams = await this.prisma.team.findMany({
        where: { departmentId: dto.targetDepartmentId, companyId },
        select: { teamLeadId: true },
      });
      teams.forEach((t) => ids.add(t.teamLeadId));
    } else if (dto.scope === MeetingScope.TEAM && dto.targetTeamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: dto.targetTeamId },
        include: {
          members: {
            include: { user: { select: { id: true, isBlocked: true } } },
          },
        },
      });
      team?.members
        .filter((m) => !m.user?.isBlocked)
        .forEach((m) => ids.add(m.userId));
      if (team?.teamLeadId) ids.add(team.teamLeadId);
    }
    return [...ids];
  }

  // ──────────────────────────────────────────────
  // CRUD
  // ──────────────────────────────────────────────

  async create(
    dto: CreateMeetingDto,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    await this.assertCanCreate(dto, userId, role, companyId);

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime()))
      throw new BadRequestException("Invalid startsAt");
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (endsAt && endsAt <= startsAt)
      throw new BadRequestException("endsAt must be after startsAt");

    const hostId = dto.hostId ?? userId;
    if (dto.hostId && dto.hostId !== userId) {
      const host = await this.prisma.user.findUnique({
        where: { id: dto.hostId },
        select: { companyId: true },
      });
      if (!host || host.companyId !== companyId)
        throw new NotFoundException("Host not found");
    }

    const participantIds = await this.resolveParticipants(
      dto,
      hostId,
      companyId,
    );

    const meeting = await this.prisma.meeting.create({
      data: {
        title: dto.title,
        agenda: dto.agenda,
        link: dto.link,
        location: dto.location,
        startsAt,
        endsAt,
        scope: dto.scope,
        targetRole: dto.scope === MeetingScope.ROLE ? dto.targetRole : null,
        targetDepartmentId:
          dto.scope === MeetingScope.DEPARTMENT ? dto.targetDepartmentId : null,
        targetTeamId:
          dto.scope === MeetingScope.TEAM ? dto.targetTeamId : null,
        hostId,
        createdById: userId,
        companyId,
        participants: {
          create: participantIds.map((uid) => ({
            userId: uid,
            // The host RSVPs themselves in by default.
            rsvp: uid === hostId ? MeetingRsvp.ACCEPTED : MeetingRsvp.PENDING,
            respondedAt: uid === hostId ? new Date() : null,
          })),
        },
      },
      include: MEETING_INCLUDE,
    });

    // Notify participants (skip the creator).
    const startLabel = startsAt.toLocaleString();
    await Promise.all(
      participantIds
        .filter((id) => id !== userId)
        .map((id) =>
          this.notifications.notify(
            id,
            NotificationType.MEETING_INVITED,
            `${meeting.createdBy.fullName} invited you to "${meeting.title}" on ${startLabel}`,
          ),
        ),
    );

    return meeting;
  }

  /** Find meetings visible to the caller (participant, creator, host, or CEO). */
  async findAll(
    userId: string,
    role: Role,
    companyId: string,
    filter: "upcoming" | "past" | "all",
    pagination: PaginationDto,
  ) {
    const now = new Date();
    const visibility: Prisma.MeetingWhereInput =
      role === Role.CEO
        ? { companyId }
        : {
            companyId,
            OR: [
              { participants: { some: { userId } } },
              { hostId: userId },
              { createdById: userId },
            ],
          };
    const timeFilter: Prisma.MeetingWhereInput =
      filter === "upcoming"
        ? { startsAt: { gte: now }, status: { not: MeetingStatus.CANCELLED } }
        : filter === "past"
          ? { startsAt: { lt: now } }
          : {};
    const where: Prisma.MeetingWhereInput = { ...visibility, ...timeFilter };

    const [data, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        include: MEETING_INCLUDE,
        orderBy: {
          startsAt: filter === "past" ? "desc" : "asc",
        },
        ...paginateArgs(pagination),
      }),
      this.prisma.meeting.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  async findUpcomingForUser(userId: string, companyId: string, take = 3) {
    return this.prisma.meeting.findMany({
      where: {
        companyId,
        status: { not: MeetingStatus.CANCELLED },
        startsAt: { gte: new Date() },
        OR: [
          { participants: { some: { userId } } },
          { hostId: userId },
        ],
      },
      include: MEETING_INCLUDE,
      orderBy: { startsAt: "asc" },
      take,
    });
  }

  async findOne(
    id: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: MEETING_INCLUDE,
    });
    if (!meeting || meeting.companyId !== companyId)
      throw new NotFoundException("Meeting not found");
    const isParticipant = meeting.participants.some((p) => p.userId === userId);
    if (
      role !== Role.CEO &&
      meeting.createdById !== userId &&
      meeting.hostId !== userId &&
      !isParticipant
    ) {
      throw new ForbiddenException("You do not have access to this meeting");
    }
    return meeting;
  }

  async update(
    id: string,
    dto: UpdateMeetingDto,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        createdById: true,
        hostId: true,
        status: true,
        title: true,
        participants: { select: { userId: true } },
      },
    });
    if (!meeting || meeting.companyId !== companyId)
      throw new NotFoundException("Meeting not found");
    if (meeting.status === MeetingStatus.CANCELLED)
      throw new BadRequestException("Cannot edit a cancelled meeting");
    if (role !== Role.CEO && meeting.createdById !== userId) {
      throw new ForbiddenException(
        "Only the creator or the CEO can edit this meeting",
      );
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : undefined;
    const endsAt =
      dto.endsAt === undefined
        ? undefined
        : dto.endsAt === null
          ? null
          : new Date(dto.endsAt);
    if (startsAt && endsAt && endsAt <= startsAt)
      throw new BadRequestException("endsAt must be after startsAt");

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.agenda !== undefined && { agenda: dto.agenda }),
        ...(dto.link !== undefined && { link: dto.link }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(startsAt && { startsAt }),
        ...(endsAt !== undefined && { endsAt }),
        ...(dto.hostId && { hostId: dto.hostId }),
      },
      include: MEETING_INCLUDE,
    });

    // Notify participants (excluding the editor).
    await Promise.all(
      meeting.participants
        .filter((p) => p.userId !== userId)
        .map((p) =>
          this.notifications.notify(
            p.userId,
            NotificationType.MEETING_UPDATED,
            `Meeting updated: "${updated.title}" — ${new Date(updated.startsAt).toLocaleString()}`,
          ),
        ),
    );

    return updated;
  }

  async cancel(
    id: string,
    reason: string | undefined,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        createdById: true,
        status: true,
        title: true,
        participants: { select: { userId: true } },
      },
    });
    if (!meeting || meeting.companyId !== companyId)
      throw new NotFoundException("Meeting not found");
    if (role !== Role.CEO && meeting.createdById !== userId) {
      throw new ForbiddenException(
        "Only the creator or the CEO can cancel this meeting",
      );
    }
    if (meeting.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException("Meeting is already cancelled");
    }

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: {
        status: MeetingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason ?? null,
      },
      include: MEETING_INCLUDE,
    });

    await Promise.all(
      meeting.participants
        .filter((p) => p.userId !== userId)
        .map((p) =>
          this.notifications.notify(
            p.userId,
            NotificationType.MEETING_CANCELLED,
            `Meeting cancelled: "${updated.title}"${reason ? ` — ${reason}` : ""}`,
          ),
        ),
    );

    return updated;
  }

  async rsvp(
    id: string,
    rsvp: MeetingRsvp,
    userId: string,
    companyId: string,
  ) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true },
    });
    if (!meeting || meeting.companyId !== companyId)
      throw new NotFoundException("Meeting not found");
    if (meeting.status === MeetingStatus.CANCELLED)
      throw new BadRequestException("Cannot RSVP to a cancelled meeting");
    const participant = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: id, userId } },
    });
    if (!participant)
      throw new ForbiddenException(
        "You are not a participant of this meeting",
      );
    return this.prisma.meetingParticipant.update({
      where: { meetingId_userId: { meetingId: id, userId } },
      data: { rsvp, respondedAt: new Date() },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
    });
  }

  // ──────────────────────────────────────────────
  // What can the caller schedule? Drives the create-meeting picker UI.
  // ──────────────────────────────────────────────

  async eligibleScopes(userId: string, role: Role, companyId: string) {
    const result: {
      canScheduleCompany: boolean;
      canScheduleRoles: Role[];
      departments: { id: string; name: string }[];
      teams: { id: string; name: string; departmentName: string | null }[];
    } = {
      canScheduleCompany: role === Role.CEO,
      canScheduleRoles:
        role === Role.CEO
          ? [
              Role.ASSISTANT,
              Role.DEPARTMENT_HEAD,
              Role.TEAM_LEAD,
              Role.EMPLOYEE,
            ]
          : [],
      departments: [],
      teams: [],
    };

    if (role === Role.CEO) {
      const depts = await this.prisma.department.findMany({
        where: { companyId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      result.departments = depts;
      const teams = await this.prisma.team.findMany({
        where: { companyId },
        select: {
          id: true,
          name: true,
          department: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      });
      result.teams = teams.map((t) => ({
        id: t.id,
        name: t.name,
        departmentName: t.department?.name ?? null,
      }));
      return result;
    }

    if (role === Role.DEPARTMENT_HEAD) {
      const depts = await this.prisma.department.findMany({
        where: { headId: userId, companyId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      result.departments = depts;
      const teams = await this.prisma.team.findMany({
        where: {
          companyId,
          OR: [
            { departmentId: { in: depts.map((d) => d.id) } },
            {
              isShared: true,
              sharedDepartments: {
                some: { departmentId: { in: depts.map((d) => d.id) } },
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          department: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      });
      result.teams = teams.map((t) => ({
        id: t.id,
        name: t.name,
        departmentName: t.department?.name ?? null,
      }));
      return result;
    }

    if (role === Role.TEAM_LEAD) {
      const teams = await this.prisma.team.findMany({
        where: { companyId, teamLeadId: userId },
        select: {
          id: true,
          name: true,
          department: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      });
      result.teams = teams.map((t) => ({
        id: t.id,
        name: t.name,
        departmentName: t.department?.name ?? null,
      }));
    }
    return result;
  }
}
