import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { UpdateCompanyDto } from "./dto/update-company.dto";

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get company details with counts.
   */
  async getCompanyProfile(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        _count: { select: { users: true, teams: true } },
      },
    });

    if (!company) {
      throw new NotFoundException("Company not found");
    }

    return company;
  }

  /**
   * Update company details (CEO only).
   */
  async updateCompany(companyId: string, dto: UpdateCompanyDto) {
    return this.prisma.company.update({
      where: { id: companyId },
      data: { ...dto },
    });
  }

  /**
   * CEO dashboard — company-wide statistics.
   */
  async getDashboardStats(companyId: string) {
    const [
      totalUsers,
      usersByRole,
      totalTeams,
      totalDepartments,
      totalProjects,
      totalTasks,
      tasksByStatus,
      tasksByPriority,
      recentActivity,
    ] = await Promise.all([
      // Total users
      this.prisma.user.count({ where: { companyId } }),

      // Users grouped by role
      this.prisma.user.groupBy({
        by: ["role"],
        where: { companyId },
        _count: true,
      }),

      // Total teams
      this.prisma.team.count({ where: { companyId } }),

      // Total departments
      this.prisma.department.count({ where: { companyId } }),

      // Total projects
      this.prisma.project.count({ where: { companyId } }),

      // Total tasks (via teams that belong to this company)
      this.prisma.task.count({
        where: { team: { companyId } },
      }),

      // Tasks grouped by status
      this.prisma.task.groupBy({
        by: ["status"],
        where: { team: { companyId } },
        _count: true,
      }),

      // Tasks grouped by priority
      this.prisma.task.groupBy({
        by: ["priority"],
        where: { team: { companyId } },
        _count: true,
      }),

      // Last 10 activity logs
      this.prisma.activityLog.findMany({
        where: { companyId },
        include: {
          user: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        byRole: usersByRole.reduce(
          (acc, item) => ({ ...acc, [item.role]: item._count }),
          {},
        ),
      },
      teams: {
        total: totalTeams,
      },
      departments: {
        total: totalDepartments,
      },
      projects: {
        total: totalProjects,
      },
      tasks: {
        total: totalTasks,
        byStatus: tasksByStatus.reduce(
          (acc, item) => ({ ...acc, [item.status]: item._count }),
          {},
        ),
        byPriority: tasksByPriority.reduce(
          (acc, item) => ({ ...acc, [item.priority]: item._count }),
          {},
        ),
      },
      recentActivity,
    };
  }
}
