import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add a comment to a task.
   * Only the task's assignee or creator (team lead) can comment.
   */
  async create(taskId: string, userId: string, dto: CreateCommentDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, assigneeId: true, creatorId: true },
    });

    if (!task) {
      throw new NotFoundException("Task not found");
    }

    if (task.assigneeId !== userId && task.creatorId !== userId) {
      throw new ForbiddenException(
        "Only the task assignee or creator can comment",
      );
    }

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
  async findByTask(taskId: string, userId: string, pagination: PaginationDto) {
    // Verify user has access to this task
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { assigneeId: true, creatorId: true },
    });

    if (!task) {
      throw new NotFoundException("Task not found");
    }

    if (task.assigneeId !== userId && task.creatorId !== userId) {
      throw new ForbiddenException("You do not have access to this task");
    }

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
