import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import { Prisma, Role } from "@prisma/client";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ──────────────────────────────────────────────
  // CEO: Create a cross-department project
  // ──────────────────────────────────────────────

  async create(dto: CreateProjectDto, companyId: string, userId: string) {
    // Validate all departments exist and belong to this company
    const departments = await this.prisma.department.findMany({
      where: { id: { in: dto.departmentIds }, companyId },
    });

    if (departments.length !== dto.departmentIds.length) {
      throw new BadRequestException(
        "One or more department IDs are invalid or do not belong to your company",
      );
    }

    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        companyId,
        creatorId: userId,
        departments: {
          create: dto.departmentIds.map((deptId) => ({
            departmentId: deptId,
          })),
        },
      },
      include: {
        creator: { select: { id: true, fullName: true, email: true } },
        departments: {
          include: {
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    await this.activityLog.logAction(
      userId,
      companyId,
      "PROJECT_CREATED",
      "Project",
      project.id,
      {
        name: project.name,
        departments: departments.map((d) => d.name),
      },
    );

    return project;
  }

  // ──────────────────────────────────────────────
  // List projects (scoped by role)
  // ──────────────────────────────────────────────

  async findAll(
    companyId: string,
    userId: string,
    role: Role,
    pagination: PaginationDto,
  ) {
    let where: Prisma.ProjectWhereInput = { companyId };

    // Department heads see only projects that include their department
    if (role === Role.DEPARTMENT_HEAD) {
      where = {
        companyId,
        departments: {
          some: {
            department: { headId: userId },
          },
        },
      };
    }

    // Team leads see projects that include teams they lead
    if (role === Role.TEAM_LEAD) {
      where = {
        companyId,
        departments: {
          some: {
            department: {
              teams: { some: { teamLeadId: userId } },
            },
          },
        },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: {
          creator: { select: { id: true, fullName: true } },
          departments: {
            include: {
              department: { select: { id: true, name: true } },
            },
          },
          _count: { select: { tasks: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prisma.project.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  // ──────────────────────────────────────────────
  // Get single project with department breakdown
  // ──────────────────────────────────────────────

  async findOne(projectId: string, companyId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        creator: { select: { id: true, fullName: true, email: true } },
        departments: {
          include: {
            department: {
              select: {
                id: true,
                name: true,
                head: {
                  select: { id: true, fullName: true, email: true },
                },
              },
            },
          },
        },
        _count: { select: { tasks: true } },
      },
    });

    if (!project || project.companyId !== companyId) {
      throw new NotFoundException("Project not found");
    }

    return project;
  }

  // ──────────────────────────────────────────────
  // CEO: Update project
  // ──────────────────────────────────────────────

  async update(projectId: string, dto: UpdateProjectDto, companyId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.companyId !== companyId) {
      throw new NotFoundException("Project not found");
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: { ...dto },
      include: {
        departments: {
          include: {
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  // ──────────────────────────────────────────────
  // CEO: Add department to project
  // ──────────────────────────────────────────────

  async addDepartment(
    projectId: string,
    departmentId: string,
    companyId: string,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project || project.companyId !== companyId) {
      throw new NotFoundException("Project not found");
    }

    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department || department.companyId !== companyId) {
      throw new NotFoundException("Department not found");
    }

    // Check if already linked
    const existing = await this.prisma.projectDepartment.findUnique({
      where: {
        projectId_departmentId: { projectId, departmentId },
      },
    });
    if (existing) {
      throw new BadRequestException(
        "Department is already linked to this project",
      );
    }

    return this.prisma.projectDepartment.create({
      data: { projectId, departmentId },
      include: {
        department: { select: { id: true, name: true } },
      },
    });
  }

  // ──────────────────────────────────────────────
  // CEO: Remove department from project
  // ──────────────────────────────────────────────

  async removeDepartment(
    projectId: string,
    departmentId: string,
    companyId: string,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project || project.companyId !== companyId) {
      throw new NotFoundException("Project not found");
    }

    const link = await this.prisma.projectDepartment.findUnique({
      where: {
        projectId_departmentId: { projectId, departmentId },
      },
    });
    if (!link) {
      throw new NotFoundException(
        "Department is not linked to this project",
      );
    }

    await this.prisma.projectDepartment.delete({
      where: { id: link.id },
    });

    return { message: "Department removed from project" };
  }

  // ──────────────────────────────────────────────
  // Project tasks (scoped by department for dept heads)
  // ──────────────────────────────────────────────

  async getProjectTasks(
    projectId: string,
    companyId: string,
    userId: string,
    role: Role,
    pagination: PaginationDto,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project || project.companyId !== companyId) {
      throw new NotFoundException("Project not found");
    }

    let where: Prisma.TaskWhereInput = { projectId };

    // Department heads only see tasks tagged with their department
    if (role === Role.DEPARTMENT_HEAD) {
      const headDepts = await this.prisma.department.findMany({
        where: { headId: userId, companyId },
        select: { name: true },
      });
      const deptNames = headDepts.map((d) => d.name);
      where = {
        projectId,
        departmentTag: { in: deptNames },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          assignee: { select: { id: true, fullName: true, email: true } },
          team: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  // ──────────────────────────────────────────────
  // Project dashboard (per-department progress)
  // ──────────────────────────────────────────────

  async getDashboard(projectId: string, companyId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        departments: {
          include: {
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!project || project.companyId !== companyId) {
      throw new NotFoundException("Project not found");
    }

    // Get task stats per department tag
    const taskStats = await this.prisma.task.groupBy({
      by: ["status", "departmentTag"],
      where: { projectId },
      _count: true,
    });

    // Organize stats by department
    const departmentStats = project.departments.map((pd) => {
      const deptTasks = taskStats.filter(
        (t) => t.departmentTag === pd.department.name,
      );
      const statusBreakdown = deptTasks.reduce(
        (acc, t) => ({ ...acc, [t.status]: t._count }),
        {},
      );
      const total = deptTasks.reduce((sum, t) => sum + t._count, 0);

      return {
        department: pd.department,
        tasks: { total, byStatus: statusBreakdown },
      };
    });

    // Overall stats
    const overallStats = await this.prisma.task.groupBy({
      by: ["status"],
      where: { projectId },
      _count: true,
    });

    const totalTasks = overallStats.reduce((sum, t) => sum + t._count, 0);

    return {
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
      },
      overall: {
        totalTasks,
        byStatus: overallStats.reduce(
          (acc, t) => ({ ...acc, [t.status]: t._count }),
          {},
        ),
      },
      departments: departmentStats,
    };
  }
}
