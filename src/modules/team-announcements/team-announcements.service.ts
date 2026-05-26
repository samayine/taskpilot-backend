import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginate, paginateArgs } from "src/common/helpers/pagination.helper";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto";
import { Role } from "@prisma/client";

@Injectable()
export class TeamAnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // Access helpers
  // ──────────────────────────────────────────────

  /** Whether a user may VIEW announcements in this team. */
  private async canViewTeam(
    teamId: string,
    userId: string,
    role: Role,
    companyId: string,
  ): Promise<{ team: { id: string; companyId: string; teamLeadId: string; departmentId: string | null; isShared: boolean } }> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { sharedDepartments: { select: { departmentId: true } } },
    });
    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    if (role === Role.CEO) return { team };
    if (team.teamLeadId === userId) return { team };

    if (role === Role.DEPARTMENT_HEAD) {
      const headed = await this.prisma.department.findMany({
        where: { headId: userId, companyId },
        select: { id: true },
      });
      const headedIds = new Set(headed.map((d) => d.id));
      const matches = team.isShared
        ? team.sharedDepartments.some((sd) => headedIds.has(sd.departmentId))
        : !!team.departmentId && headedIds.has(team.departmentId);
      if (matches) return { team };
    }

    const member = await this.prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (member) return { team };

    throw new ForbiddenException(
      "You do not have permission to access this resource",
    );
  }

  /** Whether a user may POST / EDIT / DELETE announcements in this team. */
  private async canManageTeam(
    team: { id: string; teamLeadId: string; departmentId: string | null; isShared: boolean },
    userId: string,
    role: Role,
  ): Promise<boolean> {
    if (role === Role.CEO) return true;
    if (team.teamLeadId === userId) return true;
    if (role === Role.DEPARTMENT_HEAD) {
      const headed = await this.prisma.department.findMany({
        where: { headId: userId },
        select: { id: true },
      });
      const headedIds = new Set(headed.map((d) => d.id));
      if (team.isShared) {
        const shared = await this.prisma.teamDepartment.findMany({
          where: { teamId: team.id },
          select: { departmentId: true },
        });
        return shared.some((sd) => headedIds.has(sd.departmentId));
      }
      return !!team.departmentId && headedIds.has(team.departmentId);
    }
    return false;
  }

  // ──────────────────────────────────────────────
  // List announcements for a team (paginated; pinned first)
  // ──────────────────────────────────────────────

  async list(
    teamId: string,
    userId: string,
    role: Role,
    companyId: string,
    pagination: PaginationDto,
  ) {
    await this.canViewTeam(teamId, userId, role, companyId);

    const where = { teamId };
    const [data, total] = await Promise.all([
      this.prisma.teamAnnouncement.findMany({
        where,
        include: {
          author: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        ...paginateArgs(pagination),
      }),
      this.prisma.teamAnnouncement.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  // ──────────────────────────────────────────────
  // Create
  // ──────────────────────────────────────────────

  async create(
    teamId: string,
    userId: string,
    role: Role,
    companyId: string,
    dto: CreateAnnouncementDto,
  ) {
    const { team } = await this.canViewTeam(teamId, userId, role, companyId);
    if (!(await this.canManageTeam(team, userId, role))) {
      throw new ForbiddenException(
        "Only the team lead, the department head, or the CEO can post announcements",
      );
    }

    return this.prisma.teamAnnouncement.create({
      data: {
        teamId,
        authorId: userId,
        content: dto.content,
        pinned: dto.pinned ?? false,
      },
      include: {
        author: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });
  }

  // ──────────────────────────────────────────────
  // Update (author OR managers)
  // ──────────────────────────────────────────────

  async update(
    teamId: string,
    announcementId: string,
    userId: string,
    role: Role,
    companyId: string,
    dto: UpdateAnnouncementDto,
  ) {
    const { team } = await this.canViewTeam(teamId, userId, role, companyId);
    const ann = await this.prisma.teamAnnouncement.findUnique({
      where: { id: announcementId },
    });
    if (!ann || ann.teamId !== teamId) {
      throw new NotFoundException("Announcement not found");
    }

    const isManager = await this.canManageTeam(team, userId, role);
    if (ann.authorId !== userId && !isManager) {
      throw new ForbiddenException(
        "You do not have permission to edit this announcement",
      );
    }

    return this.prisma.teamAnnouncement.update({
      where: { id: announcementId },
      data: {
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.pinned !== undefined && { pinned: dto.pinned }),
      },
      include: {
        author: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });
  }

  // ──────────────────────────────────────────────
  // Delete (author OR managers)
  // ──────────────────────────────────────────────

  async remove(
    teamId: string,
    announcementId: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    const { team } = await this.canViewTeam(teamId, userId, role, companyId);
    const ann = await this.prisma.teamAnnouncement.findUnique({
      where: { id: announcementId },
    });
    if (!ann || ann.teamId !== teamId) {
      throw new NotFoundException("Announcement not found");
    }

    const isManager = await this.canManageTeam(team, userId, role);
    if (ann.authorId !== userId && !isManager) {
      throw new ForbiddenException(
        "You do not have permission to delete this announcement",
      );
    }

    await this.prisma.teamAnnouncement.delete({ where: { id: announcementId } });
    return { message: "Announcement deleted" };
  }
}
