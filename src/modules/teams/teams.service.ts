import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateTeamDto } from "./dto/create-team.dto";
import { AddTeamMemberDto } from "./dto/add-team-member.dto";
import { Role } from "@prisma/client";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ──────────────────────────────────────────────
  // CEO: create a new team
  // ──────────────────────────────────────────────

  async createTeam(dto: CreateTeamDto, companyId: string) {
    const teamLead = await this.prisma.user.findUnique({
      where: { id: dto.teamLeadId },
    });

    if (!teamLead) {
      throw new NotFoundException("Team lead user not found");
    }

    if (teamLead.companyId !== companyId) {
      throw new BadRequestException("Team lead does not belong to your company");
    }

    if (teamLead.role !== Role.TEAM_LEAD && teamLead.role !== Role.CEO) {
      throw new BadRequestException(
        "Designated user must have the TEAM_LEAD or CEO role",
      );
    }

    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        description: dto.description,
        departmentId: dto.departmentId,
        companyId,
        teamLeadId: dto.teamLeadId,
      },
      include: {
        teamLead: { select: { id: true, fullName: true, email: true, role: true } },
        department: { select: { id: true, name: true } },
      },
    });

    await this.activityLog.logAction(
      team.teamLead.id,
      companyId,
      "TEAM_CREATED",
      "Team",
      team.id,
      { teamName: team.name, teamLeadName: team.teamLead.fullName },
    );

    return team;
  }

  // ──────────────────────────────────────────────
  // List teams — scoped by caller role
  // CEO: all company teams
  // DEPARTMENT_HEAD: only teams in their departments
  // TEAM_LEAD: only teams they lead
  // ──────────────────────────────────────────────

  async findAllByCompany(
    companyId: string,
    pagination: PaginationDto,
    callerRole: Role,
    callerId: string,
    departmentId?: string,
  ) {
    const where: any = { companyId };

    // Explicit dept filter (CEO can use this)
    if (departmentId) {
      where.departmentId = departmentId;
    }

    // DEPARTMENT_HEAD — scope to their own departments only
    if (callerRole === Role.DEPARTMENT_HEAD) {
      // Find all departments this user heads
      const headedDepts = await this.prisma.department.findMany({
        where: { headId: callerId, companyId },
        select: { id: true },
      });
      const deptIds = headedDepts.map((d) => d.id);

      if (departmentId) {
        // If they passed a dept filter, validate it's one they head
        if (!deptIds.includes(departmentId)) {
          throw new ForbiddenException(
            "You can only view teams in departments you head",
          );
        }
        // where.departmentId already set above
      } else {
        where.departmentId = { in: deptIds };
      }
    }

    // TEAM_LEAD — only their own teams
    if (callerRole === Role.TEAM_LEAD) {
      where.teamLeadId = callerId;
    }

    const [data, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        include: {
          teamLead: { select: { id: true, fullName: true, email: true, role: true } },
          department: { select: { id: true, name: true } },
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prisma.team.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  // ──────────────────────────────────────────────
  // Get single team — with scoping for DEPT_HEAD
  // ──────────────────────────────────────────────

  async findOne(
    teamId: string,
    companyId: string,
    callerRole: Role,
    callerId: string,
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        teamLead: { select: { id: true, fullName: true, email: true, role: true } },
        department: { select: { id: true, name: true } },
        members: {
          include: {
            user: { select: { id: true, fullName: true, email: true, role: true } },
          },
        },
      },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    // DEPARTMENT_HEAD — can only see teams in their own departments
    if (callerRole === Role.DEPARTMENT_HEAD) {
      const dept = await this.prisma.department.findUnique({
        where: { id: team.departmentId ?? undefined },
      });
      if (!dept || dept.headId !== callerId) {
        throw new ForbiddenException(
          "You can only view teams in departments you head",
        );
      }
    }

    // TEAM_LEAD — can only see their own team
    if (callerRole === Role.TEAM_LEAD && team.teamLeadId !== callerId) {
      throw new ForbiddenException("You can only view teams you lead");
    }

    return team;
  }

  // ──────────────────────────────────────────────
  // Edit team — CEO or DEPARTMENT_HEAD (own dept)
  // ──────────────────────────────────────────────

  async updateTeam(
    teamId: string,
    companyId: string,
    callerRole: Role,
    callerId: string,
    dto: { name?: string; description?: string; teamLeadId?: string },
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    // DEPARTMENT_HEAD can only edit their own dept's teams
    if (callerRole === Role.DEPARTMENT_HEAD) {
      const dept = await this.prisma.department.findUnique({
        where: { id: team.departmentId ?? undefined },
      });
      if (!dept || dept.headId !== callerId) {
        throw new ForbiddenException(
          "You can only edit teams in departments you head",
        );
      }
    }

    // Validate new team lead if provided
    if (dto.teamLeadId) {
      const teamLead = await this.prisma.user.findUnique({
        where: { id: dto.teamLeadId },
      });
      if (!teamLead || teamLead.companyId !== companyId) {
        throw new NotFoundException("Team lead user not found");
      }
      if (
        teamLead.role !== Role.TEAM_LEAD &&
        teamLead.role !== Role.CEO &&
        teamLead.role !== Role.DEPARTMENT_HEAD
      ) {
        throw new BadRequestException(
          "Designated user must have the TEAM_LEAD, CEO, or DEPARTMENT_HEAD role",
        );
      }
    }

    return this.prisma.team.update({
      where: { id: teamId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.teamLeadId && { teamLeadId: dto.teamLeadId }),
      },
      include: {
        teamLead: { select: { id: true, fullName: true, email: true, role: true } },
        department: { select: { id: true, name: true } },
      },
    });
  }

  // ──────────────────────────────────────────────
  // Delete team — CEO or DEPARTMENT_HEAD (own dept)
  // ──────────────────────────────────────────────

  async deleteTeam(
    teamId: string,
    companyId: string,
    callerRole: Role,
    callerId: string,
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    // DEPARTMENT_HEAD can only delete their own dept's teams
    if (callerRole === Role.DEPARTMENT_HEAD) {
      const dept = await this.prisma.department.findUnique({
        where: { id: team.departmentId ?? undefined },
      });
      if (!dept || dept.headId !== callerId) {
        throw new ForbiddenException(
          "You can only delete teams in departments you head",
        );
      }
    }

    await this.prisma.team.delete({ where: { id: teamId } });

    return { message: "Team deleted successfully" };
  }

  // ──────────────────────────────────────────────
  // Add member — CEO or DEPARTMENT_HEAD (own dept)
  // ──────────────────────────────────────────────

  async addMember(
    teamId: string,
    dto: AddTeamMemberDto,
    companyId: string,
    callerRole: Role,
    callerId: string,
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    // DEPARTMENT_HEAD can only manage their own dept's teams
    if (callerRole === Role.DEPARTMENT_HEAD) {
      const dept = await this.prisma.department.findUnique({
        where: { id: team.departmentId ?? undefined },
      });
      if (!dept || dept.headId !== callerId) {
        throw new ForbiddenException(
          "You can only manage members of teams in your department",
        );
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.companyId !== companyId) {
      throw new BadRequestException("User does not belong to your company");
    }

    const existingMember = await this.prisma.teamMember.findUnique({
      where: {
        userId_teamId: { userId: dto.userId, teamId },
      },
    });

    if (existingMember) {
      throw new ConflictException("User is already a member of this team");
    }

    return this.prisma.teamMember.create({
      data: {
        userId: dto.userId,
        teamId,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
    });
  }

  // ──────────────────────────────────────────────
  // Remove member — CEO or DEPARTMENT_HEAD (own dept)
  // ──────────────────────────────────────────────

  async removeMember(
    teamId: string,
    userId: string,
    companyId: string,
    callerRole: Role,
    callerId: string,
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    // DEPARTMENT_HEAD can only manage their own dept's teams
    if (callerRole === Role.DEPARTMENT_HEAD) {
      const dept = await this.prisma.department.findUnique({
        where: { id: team.departmentId ?? undefined },
      });
      if (!dept || dept.headId !== callerId) {
        throw new ForbiddenException(
          "You can only manage members of teams in your department",
        );
      }
    }

    const membership = await this.prisma.teamMember.findUnique({
      where: {
        userId_teamId: { userId, teamId },
      },
    });

    if (!membership) {
      throw new NotFoundException("User is not a member of this team");
    }

    await this.prisma.teamMember.delete({
      where: { id: membership.id },
    });

    return { message: "Member removed from team" };
  }
}
