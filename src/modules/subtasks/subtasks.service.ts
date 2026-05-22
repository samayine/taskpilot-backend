import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Role } from "@prisma/client";
import { CreateSubtaskDto } from "./dto/create-subtask.dto";
import { UpdateSubtaskDto } from "./dto/update-subtask.dto";

@Injectable()
export class SubtasksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verify the caller may view/manage a task's subtasks, mirroring task view rules:
   *  - assignee or creator: always
   *  - CEO: any task in the company
   *  - TEAM_LEAD: tasks in teams they lead
   *  - DEPARTMENT_HEAD: tasks in their dept's teams, or shared teams tagged for their dept
   */
  private async assertCanAccess(
    taskId: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        assigneeId: true,
        creatorId: true,
        taggedDepartmentId: true,
        team: {
          select: {
            companyId: true,
            departmentId: true,
            isShared: true,
            teamLeadId: true,
          },
        },
      },
    });

    if (!task || task.team.companyId !== companyId) {
      throw new NotFoundException("Task not found");
    }

    if (
      role === Role.CEO ||
      task.assigneeId === userId ||
      task.creatorId === userId ||
      (role === Role.TEAM_LEAD && task.team.teamLeadId === userId)
    ) {
      return;
    }

    if (role === Role.DEPARTMENT_HEAD) {
      const headed = await this.prisma.department.findMany({
        where: { headId: userId, companyId },
        select: { id: true },
      });
      const ids = new Set(headed.map((d) => d.id));
      const ok = task.team.isShared
        ? !!task.taggedDepartmentId && ids.has(task.taggedDepartmentId)
        : !!task.team.departmentId && ids.has(task.team.departmentId);
      if (ok) return;
    }

    throw new ForbiddenException("You do not have access to this task");
  }

  async findByTask(
    taskId: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    await this.assertCanAccess(taskId, userId, role, companyId);
    return this.prisma.subtask.findMany({
      where: { taskId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  }

  async create(
    taskId: string,
    userId: string,
    role: Role,
    companyId: string,
    dto: CreateSubtaskDto,
  ) {
    await this.assertCanAccess(taskId, userId, role, companyId);
    const last = await this.prisma.subtask.findFirst({
      where: { taskId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return this.prisma.subtask.create({
      data: {
        taskId,
        title: dto.title,
        position: (last?.position ?? 0) + 1,
      },
    });
  }

  async update(
    taskId: string,
    subtaskId: string,
    userId: string,
    role: Role,
    companyId: string,
    dto: UpdateSubtaskDto,
  ) {
    await this.assertCanAccess(taskId, userId, role, companyId);
    const subtask = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
    });
    if (!subtask || subtask.taskId !== taskId) {
      throw new NotFoundException("Subtask not found");
    }
    return this.prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.isDone !== undefined && { isDone: dto.isDone }),
      },
    });
  }

  async remove(
    taskId: string,
    subtaskId: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    await this.assertCanAccess(taskId, userId, role, companyId);
    const subtask = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
    });
    if (!subtask || subtask.taskId !== taskId) {
      throw new NotFoundException("Subtask not found");
    }
    await this.prisma.subtask.delete({ where: { id: subtaskId } });
    return { message: "Subtask deleted" };
  }
}
