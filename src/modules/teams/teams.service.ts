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

  async createTeam(
    dto: CreateTeamDto,
    companyId: string,
    callerRole: Role,
    callerId: string,
  ) {
    // DEPARTMENT_HEAD must supply a departmentId that they actually head
    if (callerRole === Role.DEPARTMENT_HEAD) {
      if (!dto.departmentId) {
        throw new BadRequestException(
          "Department heads must specify a department when creating a team",
        );
      }
      const dept = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
      });
      if (!dept || dept.companyId !== companyId || dept.headId !== callerId) {
        throw new ForbiddenException(
          "You can only create teams in departments you head",
        );
      }
    }

    const teamLead = await this.prisma.user.findUnique({
      where: { id: dto.teamLeadId },
    });

    if (!teamLead) {
      throw new NotFoundException("Team lead user not found");
    }

    if (teamLead.companyId !== companyId) {
      throw new BadRequestException(
        "Team lead does not belong to your company",
      );
    }

    if (teamLead.isBlocked) {
      throw new BadRequestException("Cannot assign a blocked user as team lead");
    }

    // CEO and DEPARTMENT_HEAD cannot be demoted — only EMPLOYEE / TEAM_LEAD
    if (
      teamLead.role === Role.CEO ||
      teamLead.role === Role.ASSISTANT
    ) {
      throw new BadRequestException(
        "CEO and ASSISTANT users cannot be assigned as team lead",
      );
    }

    // For DEPARTMENT_HEAD caller: the selected team lead must also belong
    // to the same department
    if (callerRole === Role.DEPARTMENT_HEAD && dto.departmentId) {
      if (
        teamLead.departmentId !== dto.departmentId &&
        teamLead.role !== Role.DEPARTMENT_HEAD
      ) {
        throw new BadRequestException(
          "The selected team lead must be a member of the same department",
        );
      }
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

    // Promote selected user to TEAM_LEAD if they are an EMPLOYEE
    if (teamLead.role === Role.EMPLOYEE) {
      await this.prisma.user.update({
        where: { id: dto.teamLeadId },
        data: { role: Role.TEAM_LEAD },
      });
    }

    await this.activityLog.logAction(
      callerId,
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
      const newLead = await this.prisma.user.findUnique({
        where: { id: dto.teamLeadId },
      });
      if (!newLead || newLead.companyId !== companyId) {
        throw new NotFoundException("Team lead user not found");
      }
      if (newLead.isBlocked) {
        throw new BadRequestException("Cannot assign a blocked user as team lead");
      }
      if (newLead.role === Role.CEO || newLead.role === Role.ASSISTANT) {
        throw new BadRequestException(
          "CEO and ASSISTANT users cannot be assigned as team lead",
        );
      }
    }

    // Promote new lead to TEAM_LEAD if needed, demote old lead if no longer leading any team
    if (dto.teamLeadId && dto.teamLeadId !== team.teamLeadId) {
      const newLead = await this.prisma.user.findUniqueOrThrow({
        where: { id: dto.teamLeadId },
      });

      if (newLead.role === Role.EMPLOYEE) {
        await this.prisma.user.update({
          where: { id: dto.teamLeadId },
          data: { role: Role.TEAM_LEAD },
        });
      }

      // Demote old lead back to EMPLOYEE if they are TEAM_LEAD and lead no other teams
      if (team.teamLeadId) {
        const oldLead = await this.prisma.user.findUnique({
          where: { id: team.teamLeadId },
        });
        if (oldLead && oldLead.role === Role.TEAM_LEAD) {
          const otherTeams = await this.prisma.team.count({
            where: {
              teamLeadId: team.teamLeadId,
              id: { not: teamId },
            },
          });
          if (otherTeams === 0) {
            await this.prisma.user.update({
              where: { id: team.teamLeadId },
              data: { role: Role.EMPLOYEE },
            });
          }
        }
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
