import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { UpdateCommentDto } from "./dto/update-comment.dto";
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

    const content = dto.content?.trim() ?? "";
    const attachments = dto.attachments ?? [];
    if (!content && attachments.length === 0) {
      throw new BadRequestException("A comment needs text or an attachment");
    }

    // Resolve valid @mention targets (task participants, never the author)
    const requested = [...new Set(dto.mentionedUserIds ?? [])].filter(
      (id) => id !== userId,
    );
    let targets: string[] = [];
    if (requested.length > 0) {
      const allowed = new Set(
        (await this.mentionableUsers(taskId)).map((u) => u.id),
      );
      targets = requested.filter((id) => allowed.has(id));
    }

    const comment = await this.prisma.comment.create({
      data: {
        content,
        taskId,
        authorId: userId,
        ...(targets.length
          ? { mentions: { create: targets.map((uid) => ({ userId: uid })) } }
          : {}),
        ...(attachments.length
          ? {
              attachments: {
                create: attachments.map((a) => ({
                  taskId,
                  uploadedById: userId,
                  fileName: a.fileName,
                  fileUrl: a.fileUrl,
                  mimeType: a.mimeType,
                  fileSize: a.fileSize,
                  publicId: a.publicId,
                })),
              },
            }
          : {}),
      },
      include: {
        author: { select: { id: true, fullName: true, role: true } },
        mentions: {
          include: { user: { select: { id: true, fullName: true } } },
        },
        attachments: {
          include: { uploadedBy: { select: { id: true, fullName: true } } },
        },
      },
    });

    // Notify mentioned users
    if (targets.length > 0) {
      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: { title: true },
      });
      const snippet =
        content.length > 80 ? `${content.slice(0, 80)}…` : content || "an attachment";
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
   * Whether a user may act as a manager for the comment's task — used to
   * decide who can delete other people's comments.
   */
  private async canManageTask(
    taskId: string,
    userId: string,
    role: Role,
    companyId: string,
  ): Promise<boolean> {
    if (role === Role.CEO) return true;
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
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
    if (!task || task.team.companyId !== companyId) return false;
    if (role === Role.TEAM_LEAD) return task.team.teamLeadId === userId;
    if (role === Role.DEPARTMENT_HEAD) {
      const headed = await this.prisma.department.findMany({
        where: { headId: userId, companyId },
        select: { id: true },
      });
      const ids = new Set(headed.map((d) => d.id));
      return task.team.isShared
        ? !!task.taggedDepartmentId && ids.has(task.taggedDepartmentId)
        : !!task.team.departmentId && ids.has(task.team.departmentId);
    }
    return false;
  }

  /**
   * Edit a comment's text. Author only.
   */
  async update(
    taskId: string,
    commentId: string,
    userId: string,
    role: Role,
    companyId: string,
    dto: UpdateCommentDto,
  ) {
    await this.assertCanAccess(taskId, userId, role, companyId);
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, taskId: true, authorId: true },
    });
    if (!comment || comment.taskId !== taskId) {
      throw new NotFoundException("Comment not found");
    }
    if (comment.authorId !== userId) {
      throw new ForbiddenException("Only the author can edit a comment");
    }
    const content = dto.content?.trim();
    if (!content) {
      throw new BadRequestException("Comment text cannot be empty");
    }
    return this.prisma.comment.update({
      where: { id: commentId },
      data: { content },
      include: {
        author: { select: { id: true, fullName: true, role: true } },
        mentions: {
          include: { user: { select: { id: true, fullName: true } } },
        },
        attachments: {
          include: { uploadedBy: { select: { id: true, fullName: true } } },
        },
      },
    });
  }

  /**
   * Delete a comment. Author OR task manager (lead / dept-head / CEO).
   * Cascade rules in the schema clean up mentions + comment attachments.
   */
  async remove(
    taskId: string,
    commentId: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    await this.assertCanAccess(taskId, userId, role, companyId);
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, taskId: true, authorId: true },
    });
    if (!comment || comment.taskId !== taskId) {
      throw new NotFoundException("Comment not found");
    }
    if (comment.authorId !== userId) {
      const canManage = await this.canManageTask(
        taskId,
        userId,
        role,
        companyId,
      );
      if (!canManage) {
        throw new ForbiddenException(
          "You do not have permission to delete this comment",
        );
      }
    }
    await this.prisma.comment.delete({ where: { id: commentId } });
    return { message: "Comment deleted" };
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
          mentions: {
            include: { user: { select: { id: true, fullName: true } } },
          },
          attachments: {
            include: { uploadedBy: { select: { id: true, fullName: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prisma.comment.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }
}
