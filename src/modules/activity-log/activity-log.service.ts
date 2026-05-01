import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";

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
   * Get activity logs for a company (CEO dashboard).
   */
  async findByCompany(companyId: string, pagination: PaginationDto) {
    const where = { companyId };
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
}
