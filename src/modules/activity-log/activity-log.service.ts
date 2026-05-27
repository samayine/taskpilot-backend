import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import { ActivityLogFilterDto } from "./dto/activity-log-filter.dto";
import { Prisma } from "@prisma/client";

/**
 * Reusable service for logging system-wide actions.
 * Called from any module: auth, tasks, teams, etc.
 */
@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log an action to the activity log.
   *
   * @param userId     - Who performed the action (null for system events)
   * @param companyId  - Company scope for multi-tenancy
   * @param action     - What happened (e.g. "USER_LOGIN", "TASK_CREATED")
   * @param entityType - Type of entity (e.g. "User", "Task", "Team")
   * @param entityId   - ID of the entity (optional)
   * @param metadata   - Additional context (optional)
   */
  async logAction(
    userId: string | null,
    companyId: string,
    action: string,
    entityType: string,
    entityId?: string,
    metadata?: Record<string, any>,
  ) {
    return this.prisma.activityLog.create({
      data: {
        userId,
        companyId,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: metadata ?? undefined,
      },
    });
  }

  /**
   * Get activity logs for a company (CEO dashboard). Optionally filter by
   * action substring, entityType, or the acting userId.
   */
  async findByCompany(
    companyId: string,
    filters: ActivityLogFilterDto = {} as ActivityLogFilterDto,
  ) {
    const where: Prisma.ActivityLogWhereInput = { companyId };
    if (filters.action) {
      where.action = { contains: filters.action, mode: "insensitive" };
    }
    if (filters.entityType) {
      where.entityType = filters.entityType;
    }
    if (filters.userId) {
      where.userId = filters.userId;
    }
    const pagination: PaginationDto = {
      page: filters.page,
      limit: filters.limit,
    };
    const [data, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  /**
   * Distinct facet values (actions + entityTypes) currently present for a
   * company. Powers the filter dropdowns on the Activity Log page.
   */
  async getFacets(companyId: string) {
    const [actions, entityTypes] = await Promise.all([
      this.prisma.activityLog.findMany({
        where: { companyId },
        select: { action: true },
        distinct: ["action"],
      }),
      this.prisma.activityLog.findMany({
        where: { companyId },
        select: { entityType: true },
        distinct: ["entityType"],
      }),
    ]);
    return {
      actions: actions.map((a) => a.action).sort(),
      entityTypes: entityTypes.map((e) => e.entityType).sort(),
    };
  }
}
