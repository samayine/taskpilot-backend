import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";
import { AssignHeadDto } from "./dto/assign-head.dto";
import { CreateTeamDto } from "../teams/dto/create-team.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import { Role } from "@prisma/client";

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ──────────────────────────────────────────────
  // CEO: Create a department
  // ──────────────────────────────────────────────

  async create(dto: CreateDepartmentDto, companyId: string, userId: string) {
    // Check for duplicate name within the company
    const existing = await this.prisma.department.findUnique({
      where: { companyId_name: { companyId, name: dto.name } },
    });

    if (existing) {
      throw new ConflictException(
        `Department "${dto.name}" already exists in your company`,
      );
    }

    const department = await this.prisma.department.create({
      data: {
        name: dto.name,
        description: dto.description,
        companyId,
      },
    });

    await this.activityLog.logAction(
      userId,
      companyId,
      "DEPARTMENT_CREATED",
      "Department",
      department.id,
      { name: department.name },
    );

    return department;
  }

  // ──────────────────────────────────────────────
  // List departments (scoped by role)
  // ──────────────────────────────────────────────

  async findAll(
    companyId: string,
    userId: string,
    role: Role,
    pagination: PaginationDto,
  ) {
    const where: any = { companyId };

    // Department heads can only see departments they head
    if (role === Role.DEPARTMENT_HEAD) {
      where.headId = userId;
    }

    const [data, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        include: {
          head: {
            select: { id: true, fullName: true, email: true, role: true },
          },
          _count: { select: { teams: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prisma.department.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  // ──────────────────────────────────────────────
  // Get single department with teams
  // ──────────────────────────────────────────────

  async findOne(departmentId: string, companyId: string, userId: string, role: Role) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        head: {
          select: { id: true, fullName: true, email: true, role: true },
        },
        teams: {
          include: {
            teamLead: {
              select: { id: true, fullName: true, email: true, role: true },
            },
            _count: { select: { members: true, tasks: true } },
          },
        },
      },
    });

    if (!department || department.companyId !== companyId) {
      throw new NotFoundException("Department not found");
    }

    // Department heads can only see their own departments
    if (role === Role.DEPARTMENT_HEAD && department.headId !== userId) {
      throw new ForbiddenException("You can only view departments you head");
    }

    return department;
  }

  // ──────────────────────────────────────────────
  // CEO: Update department
  // ──────────────────────────────────────────────

  async update(departmentId: string, dto: UpdateDepartmentDto, companyId: string) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department || department.companyId !== companyId) {
      throw new NotFoundException("Department not found");
    }

    // If name is being changed, check for duplicates
    if (dto.name && dto.name !== department.name) {
      const existing = await this.prisma.department.findUnique({
        where: { companyId_name: { companyId, name: dto.name } },
      });
      if (existing) {
        throw new ConflictException(
          `Department "${dto.name}" already exists in your company`,
        );
      }
    }

    return this.prisma.department.update({
      where: { id: departmentId },
      data: { ...dto },
    });
  }

  // ──────────────────────────────────────────────
  // CEO: Assign/change department head
  // ──────────────────────────────────────────────

  async assignHead(
    departmentId: string,
    dto: AssignHeadDto,
    companyId: string,
    callerId: string,
  ) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department || department.companyId !== companyId) {
      throw new NotFoundException("Department not found");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user || user.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }

    if (user.role !== Role.DEPARTMENT_HEAD) {
      throw new BadRequestException(
        "User must have the DEPARTMENT_HEAD role to be assigned as department head",
      );
    }

    const updated = await this.prisma.department.update({
      where: { id: departmentId },
      data: { headId: dto.userId },
      include: {
        head: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    await this.activityLog.logAction(
      callerId,
      companyId,
      "DEPARTMENT_HEAD_ASSIGNED",
      "Department",
      departmentId,
      { departmentName: updated.name, headName: updated.head?.fullName },
    );

    return updated;
  }

  // ──────────────────────────────────────────────
  // DEPARTMENT_HEAD: Create team within their department
  // ──────────────────────────────────────────────

  async createTeamInDepartment(
    departmentId: string,
    dto: CreateTeamDto,
    companyId: string,
    userId: string,
  ) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department || department.companyId !== companyId) {
      throw new NotFoundException("Department not found");
    }

    // Verify the caller is the head of this department
    if (department.headId !== userId) {
      throw new ForbiddenException(
        "Only the department head can create teams in this department",
      );
    }

    // Validate the team lead
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

    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        description: dto.description,
        departmentId,
        companyId,
        teamLeadId: dto.teamLeadId,
      },
      include: {
        teamLead: {
          select: { id: true, fullName: true, email: true, role: true },
        },
        department: { select: { id: true, name: true } },
      },
    });

    await this.activityLog.logAction(
      userId,
      companyId,
      "TEAM_CREATED_IN_DEPARTMENT",
      "Team",
      team.id,
      {
        teamName: team.name,
        departmentName: department.name,
        teamLeadName: team.teamLead.fullName,
      },
    );

    return team;
  }

  // ──────────────────────────────────────────────
  // Get all employees in a department
  // ──────────────────────────────────────────────

  async getEmployees(
    departmentId: string,
    companyId: string,
    userId: string,
    role: Role,
    pagination: PaginationDto,
  ) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      include: { teams: { select: { id: true } } },
    });

    if (!department || department.companyId !== companyId) {
      throw new NotFoundException("Department not found");
    }

    // Department heads can only see employees in their own departments
    if (role === Role.DEPARTMENT_HEAD && department.headId !== userId) {
      throw new ForbiddenException("You can only view employees in your department");
    }

    const teamIds = department.teams.map((t) => t.id);

    if (teamIds.length === 0) {
      return paginate([], 0, pagination);
    }

    const where = {
      teamId: { in: teamIds },
    };

    const [data, total] = await Promise.all([
      this.prisma.teamMember.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              status: true,
            },
          },
          team: { select: { id: true, name: true } },
        },
        ...paginateArgs(pagination),
      }),
      this.prisma.teamMember.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  // ──────────────────────────────────────────────
  // CEO: Delete a department
  // ──────────────────────────────────────────────

  async deleteDepartment(
    departmentId: string,
    companyId: string,
    userId: string,
  ) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department || department.companyId !== companyId) {
      throw new NotFoundException("Department not found");
    }

    // Hybrid delete — block when meaningful dependents exist. Project links
    // (ProjectDepartment) and shared-team links (TeamDepartment) are cleaned up
    // by schema-level cascades.
    const [teamCount, memberCount] = await Promise.all([
      this.prisma.team.count({ where: { departmentId } }),
      this.prisma.user.count({ where: { departmentId } }),
    ]);

    if (teamCount > 0) {
      throw new BadRequestException(
        "This department still has teams. Move or delete its teams before deleting it.",
      );
    }
    if (memberCount > 0) {
      throw new BadRequestException(
        "This department still has members. Reassign its users before deleting it.",
      );
    }

    await this.prisma.department.delete({ where: { id: departmentId } });

    await this.activityLog.logAction(
      userId,
      companyId,
      "DEPARTMENT_DELETED",
      "Department",
      departmentId,
      { name: department.name },
    );

    return { message: `Department "${department.name}" has been deleted` };
  }
}
