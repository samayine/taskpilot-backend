import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import { NotificationType, Role } from "@prisma/client";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Users who can be @mentioned on a task: its team members + team lead +
   * creator + assignee (deduped).
   */
  private async mentionableUsers(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        creator: { select: { id: true, fullName: true, role: true } },
        assignee: { select: { id: true, fullName: true, role: true } },
        team: {
          select: {
            teamLead: { select: { id: true, fullName: true, role: true } },
            members: {
              select: {
                user: { select: { id: true, fullName: true, role: true } },
              },
            },
          },
        },
      },
    });
    if (!task) return [];

    const map = new Map<string, { id: string; fullName: string; role: Role }>();
    const add = (u?: { id: string; fullName: string; role: Role } | null) => {
      if (u) map.set(u.id, u);
    };
    add(task.creator);
    add(task.assignee);
    add(task.team.teamLead);
    task.team.members.forEach((m) => add(m.user));
    return [...map.values()];
  }

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

    const comment = await this.prisma.comment.create({
      data: {
        content: dto.content,
        taskId,
        authorId: userId,
      },
      include: {
        author: { select: { id: true, fullName: true, role: true } },
      },
    });

    // Notify @mentioned users (restricted to task participants; never the author)
    const requested = [...new Set(dto.mentionedUserIds ?? [])].filter(
      (id) => id !== userId,
    );
    if (requested.length > 0) {
      const allowed = new Set(
        (await this.mentionableUsers(taskId)).map((u) => u.id),
      );
      const targets = requested.filter((id) => allowed.has(id));
      if (targets.length > 0) {
        const task = await this.prisma.task.findUnique({
          where: { id: taskId },
          select: { title: true },
        });
        const snippet =
          dto.content.length > 80 ? `${dto.content.slice(0, 80)}…` : dto.content;
        await Promise.all(
          targets.map((id) =>
            this.notifications.notify(
              id,
              NotificationType.MENTIONED,
              `${comment.author.fullName} mentioned you on "${task?.title}": ${snippet}`,
              taskId,
            ),
          ),
        );
      }
    }

    return comment;
  }

  /**
   * List users that can be @mentioned on a task (excludes the caller).
   */
  async getMentionable(
    taskId: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    await this.assertCanAccess(taskId, userId, role, companyId);
    return (await this.mentionableUsers(taskId)).filter((u) => u.id !== userId);
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
