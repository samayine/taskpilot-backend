import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { TaskAction } from "@prisma/client";

/**
 * Internal service for recording task history.
 * Not exposed via REST — called by TasksService on every mutation.
 */
@Injectable()
export class TaskHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a history entry for a task change.
   *
   * @param taskId     - The task that was changed
   * @param changedById - The user who made the change
   * @param action     - What happened (CREATED, STATUS_CHANGED, REVIEWED, REASSIGNED)
   * @param oldValue   - Previous state (null for CREATED)
   * @param newValue   - New state
   */
  async record(
    taskId: string,
    changedById: string,
    action: TaskAction,
    oldValue: Record<string, any> | null,
    newValue: Record<string, any>,
  ) {
    return this.prisma.taskHistory.create({
      data: {
        taskId,
        changedById,
        action,
        oldValue: oldValue ?? undefined,
        newValue,
      },
    });
  }

  /**
   * Get full history for a task (newest first).
   */
  async getHistoryForTask(taskId: string) {
    return this.prisma.taskHistory.findMany({
      where: { taskId },
      include: {
        changedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
