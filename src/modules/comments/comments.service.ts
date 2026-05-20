import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import { Role } from "@prisma/client";

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verify the caller may view/comment on a task, mirroring task view rules:
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

  /**
   * Add a comment to a task (anyone who can view the task).
   */
  async create(
    taskId: string,
    userId: string,
    role: Role,
    companyId: string,
    dto: CreateCommentDto,
  ) {
    await this.assertCanAccess(taskId, userId, role, companyId);

    return this.prisma.comment.create({
      data: {
        content: dto.content,
        taskId,
        authorId: userId,
      },
      include: {
        author: { select: { id: true, fullName: true, role: true } },
      },
    });
  }

  /**
   * Get all comments for a task (paginated, newest first).
   */
  async findByTask(
    taskId: string,
    userId: string,
    role: Role,
    companyId: string,
    pagination: PaginationDto,
  ) {
    await this.assertCanAccess(taskId, userId, role, companyId);

    const where = { taskId };

    const [data, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        include: {
          author: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prisma.comment.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }
}
