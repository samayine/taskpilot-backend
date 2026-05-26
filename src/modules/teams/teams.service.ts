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

  // Verify a DEPARTMENT_HEAD may manage the given team (normal team in a
  // department they head, or a shared team involving one of their departments).
  private async assertDeptHeadManages(
    team: {
      departmentId: string | null;
      isShared: boolean;
      sharedDepartments?: { departmentId: string }[];
    },
    callerId: string,
  ) {
    const headedDepts = await this.prisma.department.findMany({
      where: { headId: callerId },
      select: { id: true },
    });
    const deptIds = new Set(headedDepts.map((d) => d.id));

    const manages = team.isShared
      ? (team.sharedDepartments ?? []).some((sd) => deptIds.has(sd.departmentId))
      : !!team.departmentId && deptIds.has(team.departmentId);

    if (!manages) {
      throw new ForbiddenException(
        "You can only manage teams in departments you head",
      );
    }
  }

  async createTeam(
    dto: CreateTeamDto,
    companyId: string,
    callerRole: Role,
    callerId: string,
  ) {
    const isShared = !!dto.isShared;

    if (isShared) {
      // Shared (cross-department) teams are CEO-only
      if (callerRole !== Role.CEO) {
        throw new ForbiddenException(
          "Only the CEO can create shared cross-department teams",
        );
      }
      if (!dto.departmentIds || dto.departmentIds.length === 0) {
        throw new BadRequestException(
          "Shared teams require at least one involved department",
        );
      }
      const uniqueDeptIds = [...new Set(dto.departmentIds)];
      const depts = await this.prisma.department.findMany({
        where: { id: { in: uniqueDeptIds }, companyId },
        select: { id: true },
      });
      if (depts.length !== uniqueDeptIds.length) {
        throw new BadRequestException(
          "One or more departments are invalid or not in your company",
        );
      }
    } else if (callerRole === Role.DEPARTMENT_HEAD) {
      // DEPARTMENT_HEAD must supply a departmentId that they actually head
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

    // CEO and ASSISTANT cannot be demoted — only EMPLOYEE / TEAM_LEAD
    if (
      teamLead.role === Role.CEO ||
      teamLead.role === Role.ASSISTANT
    ) {
      throw new BadRequestException(
        "CEO and ASSISTANT users cannot be assigned as team lead",
      );
    }

    // For DEPARTMENT_HEAD caller on a normal team: the selected team lead
    // must also belong to the same department
    if (!isShared && callerRole === Role.DEPARTMENT_HEAD && dto.departmentId) {
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
        departmentId: isShared ? null : dto.departmentId,
        isShared,
        companyId,
        teamLeadId: dto.teamLeadId,
        ...(isShared && dto.departmentIds
          ? {
              sharedDepartments: {
                create: [...new Set(dto.departmentIds)].map((departmentId) => ({
                  departmentId,
                })),
              },
            }
          : {}),
      },
      include: {
        teamLead: { select: { id: true, fullName: true, email: true, role: true } },
        department: { select: { id: true, name: true } },
        sharedDepartments: {
          include: { department: { select: { id: true, name: true } } },
        },
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

    if (callerRole === Role.CEO) {
      // Explicit dept filter — include shared teams involving that dept
      if (departmentId) {
        where.OR = [
          { departmentId },
          { isShared: true, sharedDepartments: { some: { departmentId } } },
        ];
      }
    } else if (callerRole === Role.DEPARTMENT_HEAD) {
      // Scope to departments they head — normal teams plus shared teams
      const headedDepts = await this.prisma.department.findMany({
        where: { headId: callerId, companyId },
        select: { id: true },
      });
      const deptIds = headedDepts.map((d) => d.id);

      if (departmentId) {
        if (!deptIds.includes(departmentId)) {
          throw new ForbiddenException(
            "You can only view teams in departments you head",
          );
        }
        where.OR = [
          { departmentId },
          { isShared: true, sharedDepartments: { some: { departmentId } } },
        ];
      } else {
        where.OR = [
          { departmentId: { in: deptIds } },
          {
            isShared: true,
            sharedDepartments: { some: { departmentId: { in: deptIds } } },
          },
        ];
      }
    } else if (callerRole === Role.TEAM_LEAD) {
      // TEAM_LEAD — only their own teams
      where.teamLeadId = callerId;
    }

    const [data, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        include: {
          teamLead: { select: { id: true, fullName: true, email: true, role: true } },
          department: { select: { id: true, name: true } },
          sharedDepartments: {
            include: { department: { select: { id: true, name: true } } },
          },
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
  // List "my projects" — teams the caller is associated with
  // (member, lead, dept-head over it, or CEO who owns everything).
  // Used by the Projects page where every team = a project hub.
  // ──────────────────────────────────────────────

  async findMyProjects(
    companyId: string,
    callerId: string,
    callerRole: Role,
    pagination: PaginationDto,
  ) {
    let where: any = { companyId };

    if (callerRole === Role.CEO) {
      // CEO sees every team in the company.
    } else if (callerRole === Role.ASSISTANT) {
      // Assistants don't participate in team-based work.
      return paginate([], 0, pagination);
    } else if (callerRole === Role.DEPARTMENT_HEAD) {
      const headed = await this.prisma.department.findMany({
        where: { headId: callerId, companyId },
        select: { id: true },
      });
      const deptIds = headed.map((d) => d.id);
      where = {
        companyId,
        OR: [
          { departmentId: { in: deptIds } },
          { isShared: true, sharedDepartments: { some: { departmentId: { in: deptIds } } } },
          { teamLeadId: callerId },
          { members: { some: { userId: callerId } } },
        ],
      };
    } else {
      // TEAM_LEAD or EMPLOYEE: teams they lead OR are a member of.
      where = {
        companyId,
        OR: [
          { teamLeadId: callerId },
          { members: { some: { userId: callerId } } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        include: {
          teamLead: {
            select: { id: true, fullName: true, email: true, role: true },
          },
          department: { select: { id: true, name: true } },
          sharedDepartments: {
            include: { department: { select: { id: true, name: true } } },
          },
          _count: { select: { members: true, tasks: true, announcements: true } },
        },
        orderBy: [{ createdAt: "desc" }],
        ...paginateArgs(pagination),
      }),
      this.prisma.team.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  // ──────────────────────────────────────────────
  // Get single team — with scoping for DEPT_HEAD / EMPLOYEE membership
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
        sharedDepartments: {
          include: { department: { select: { id: true, name: true } } },
        },
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

    // DEPARTMENT_HEAD — can only see teams in their own departments (or shared
    // teams that involve one of their departments). Fall through to membership
    // check if not managing — a dept-head might also just be a team member.
    if (callerRole === Role.DEPARTMENT_HEAD) {
      const headed = await this.prisma.department.findMany({
        where: { headId: callerId },
        select: { id: true },
      });
      const deptIds = new Set(headed.map((d) => d.id));
      const manages = team.isShared
        ? team.sharedDepartments.some((sd) => deptIds.has(sd.departmentId))
        : !!team.departmentId && deptIds.has(team.departmentId);
      if (!manages) {
        const member = team.members.some((m) => m.userId === callerId);
        if (!member) {
          throw new ForbiddenException(
            "You can only view teams in departments you head",
          );
        }
      }
    }

    // TEAM_LEAD — must lead it OR be a member of it.
    if (callerRole === Role.TEAM_LEAD && team.teamLeadId !== callerId) {
      const member = team.members.some((m) => m.userId === callerId);
      if (!member) {
        throw new ForbiddenException("You can only view teams you lead or are a member of");
      }
    }

    // EMPLOYEE — must be a member of it.
    if (callerRole === Role.EMPLOYEE) {
      const member = team.members.some((m) => m.userId === callerId);
      if (!member) {
        throw new ForbiddenException(
          "You do not have permission to access this resource",
        );
      }
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
      include: { sharedDepartments: { select: { departmentId: true } } },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    // DEPARTMENT_HEAD can only edit their own dept's teams
    if (callerRole === Role.DEPARTMENT_HEAD) {
      await this.assertDeptHeadManages(team, callerId);
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
        sharedDepartments: {
          include: { department: { select: { id: true, name: true } } },
        },
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
      include: { sharedDepartments: { select: { departmentId: true } } },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    // DEPARTMENT_HEAD can only delete their own dept's teams
    if (callerRole === Role.DEPARTMENT_HEAD) {
      await this.assertDeptHeadManages(team, callerId);
    }

    // Hybrid delete — block if the team still has tasks; memberships and
    // shared-department links are cleaned up by schema-level cascades.
    const taskCount = await this.prisma.task.count({ where: { teamId } });
    if (taskCount > 0) {
      throw new BadRequestException(
        "This team has tasks. Reassign or remove its tasks before deleting it.",
      );
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
      include: { sharedDepartments: { select: { departmentId: true } } },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    // DEPARTMENT_HEAD can only manage their own dept's teams
    if (callerRole === Role.DEPARTMENT_HEAD) {
      await this.assertDeptHeadManages(team, callerId);
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
      include: { sharedDepartments: { select: { departmentId: true } } },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    // DEPARTMENT_HEAD can only manage their own dept's teams
    if (callerRole === Role.DEPARTMENT_HEAD) {
      await this.assertDeptHeadManages(team, callerId);
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
