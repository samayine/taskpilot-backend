import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { ReviewTaskDto, ReviewDecision } from "./dto/review-task.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { TaskHistoryService } from "../task-history/task-history.service";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { TaskFilterDto } from "./dto/task-filter.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import { NotificationType, Prisma, Role, TaskAction, TaskStatus } from "@prisma/client";

/**
 * Allowed status transitions — the strict task lifecycle.
 *
 *  PENDING      → IN_PROGRESS   (Employee starts)
 *  IN_PROGRESS  → SUBMITTED     (Employee submits)
 *  SUBMITTED    → REVIEW        (Team Lead picks up)
 *  REVIEW       → COMPLETED     (Team Lead approves)
 *  REVIEW       → REJECTED      (Team Lead rejects)
 *  REJECTED     → IN_PROGRESS   (Employee reworks)
 */
const EMPLOYEE_TRANSITIONS: Record<TaskStatus, TaskStatus | null> = {
  PENDING: TaskStatus.IN_PROGRESS,
  IN_PROGRESS: TaskStatus.SUBMITTED,
  SUBMITTED: null,      // employee cannot change once submitted
  REVIEW: null,         // team lead territory
  COMPLETED: null,      // terminal state
  REJECTED: TaskStatus.IN_PROGRESS,
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly taskHistory: TaskHistoryService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ──────────────────────────────────────────────
  // Team Lead: Create & assign a task
  // ──────────────────────────────────────────────

  async createTask(dto: CreateTaskDto, creatorId: string, companyId: string) {
    // 1. Validate the team exists and this team lead manages it
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    if (team.teamLeadId !== creatorId) {
      throw new ForbiddenException("You are not the lead of this team");
    }

    // 2. Validate the assignee is a member of this team and is an EMPLOYEE
    const assignee = await this.prisma.user.findUnique({
      where: { id: dto.assigneeId },
    });

    if (!assignee || assignee.companyId !== companyId) {
      throw new NotFoundException("Assignee not found");
    }

    if (assignee.role !== Role.EMPLOYEE) {
      throw new BadRequestException("Tasks can only be assigned to employees");
    }

    const isMember = await this.prisma.teamMember.findUnique({
      where: {
        userId_teamId: { userId: dto.assigneeId, teamId: dto.teamId },
      },
    });

    if (!isMember) {
      throw new BadRequestException(
        "Assignee is not a member of the specified team",
      );
    }

    // 3. Create the task
    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        teamId: dto.teamId,
        creatorId,
        assigneeId: dto.assigneeId,
      },
      include: {
        assignee: { select: { id: true, fullName: true, email: true } },
        creator: { select: { id: true, fullName: true } },
        team: { select: { id: true, name: true } },
      },
    });

    // 4. Notify the assignee
    await this.notifications.notify(
      dto.assigneeId,
      NotificationType.TASK_ASSIGNED,
      `You have been assigned a new task: "${task.title}" in team ${task.team.name}`,
      task.id,
    );

    // 5. Record history
    await this.taskHistory.record(task.id, creatorId, TaskAction.CREATED, null, {
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigneeId: dto.assigneeId,
      teamId: dto.teamId,
    });

    // 6. Activity log
    await this.activityLog.logAction(
      creatorId,
      companyId,
      "TASK_CREATED",
      "Task",
      task.id,
      { title: task.title, assigneeId: dto.assigneeId },
    );

    return task;
  }

  // ──────────────────────────────────────────────
  // Team Lead: View all tasks for their team
  // ──────────────────────────────────────────────

  async findTeamTasks(userId: string, companyId: string, filters: TaskFilterDto) {
    // Find all teams this user leads
    const teams = await this.prisma.team.findMany({
      where: { teamLeadId: userId, companyId },
      select: { id: true },
    });

    const teamIds = teams.map((t) => t.id);
    const where: Prisma.TaskWhereInput = {
      teamId: { in: teamIds },
      ...this.buildTaskFilters(filters),
    };

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          assignee: { select: { id: true, fullName: true, email: true } },
          team: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(filters),
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginate(data, total, filters);
  }

  // ──────────────────────────────────────────────
  // Employee: View my assigned tasks
  // ──────────────────────────────────────────────

  async findMyTasks(userId: string, filters: TaskFilterDto) {
    const where: Prisma.TaskWhereInput = {
      assigneeId: userId,
      ...this.buildTaskFilters(filters),
    };

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          team: { select: { id: true, name: true } },
          creator: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(filters),
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginate(data, total, filters);
  }

  // ──────────────────────────────────────────────
  // Employee: Update task status (strict lifecycle)
  // ──────────────────────────────────────────────

  async updateStatus(
    taskId: string,
    dto: UpdateTaskStatusDto,
    userId: string,
    companyId: string,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException("Task not found");
    }

    // Ownership check: only the assigned employee can update
    if (task.assigneeId !== userId) {
      throw new ForbiddenException("You can only update tasks assigned to you");
    }

    // Strict lifecycle: check if the transition is valid
    const allowedNext = EMPLOYEE_TRANSITIONS[task.status];

    if (allowedNext === null) {
      throw new BadRequestException(
        `Cannot change status from ${task.status} — not an employee action`,
      );
    }

    if (dto.status !== allowedNext) {
      throw new BadRequestException(
        `Invalid transition: ${task.status} → ${dto.status}. Expected: ${task.status} → ${allowedNext}`,
      );
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: dto.status },
      include: {
        team: { select: { id: true, name: true, teamLeadId: true } },
      },
    });

    // Notify the team lead when employee submits
    if (dto.status === TaskStatus.SUBMITTED) {
      await this.notifications.notify(
        updatedTask.team.teamLeadId,
        NotificationType.TASK_SUBMITTED,
        `Task "${updatedTask.title}" has been submitted for review`,
        taskId,
      );
    }

    // Notify team lead when employee starts a task
    if (dto.status === TaskStatus.IN_PROGRESS && task.status === TaskStatus.PENDING) {
      await this.notifications.notify(
        updatedTask.team.teamLeadId,
        NotificationType.TASK_STARTED,
        `Task "${updatedTask.title}" has been started`,
        taskId,
      );
    }
    // Record history for status change
    await this.taskHistory.record(
      taskId,
      userId,
      TaskAction.STATUS_CHANGED,
      { status: task.status },
      { status: dto.status },
    );

    // Activity log
    await this.activityLog.logAction(
      userId,
      companyId,
      "TASK_STATUS_CHANGED",
      "Task",
      taskId,
      { from: task.status, to: dto.status },
    );

    return updatedTask;
  }

  // ──────────────────────────────────────────────
  // Team Lead: Review a submitted task
  // ──────────────────────────────────────────────

  async reviewTask(taskId: string, dto: ReviewTaskDto, userId: string, companyId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { team: true },
    });

    if (!task) {
      throw new NotFoundException("Task not found");
    }

    // Only the team lead of this task's team can review
    if (task.team.teamLeadId !== userId) {
      throw new ForbiddenException(
        "Only the team lead of this task's team can review it",
      );
    }

    // Task must be in SUBMITTED status for team lead to move to REVIEW,
    // or in REVIEW status for team lead to approve/reject
    if (task.status === TaskStatus.SUBMITTED) {
      // Move to REVIEW first
      const updated = await this.prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.REVIEW },
        include: {
          assignee: { select: { id: true, fullName: true, email: true } },
          team: { select: { id: true, name: true } },
        },
      });

      // Notify the employee that their task is being reviewed
      await this.notifications.notify(
        task.assigneeId,
        NotificationType.TASK_IN_REVIEW,
        `Your task "${task.title}" is now being reviewed`,
        taskId,
      );

      // Record history
      await this.taskHistory.record(
        taskId,
        userId,
        TaskAction.REVIEWED,
        { status: TaskStatus.SUBMITTED },
        { status: TaskStatus.REVIEW },
      );

      // Activity log
      await this.activityLog.logAction(
        userId,
        companyId,
        "TASK_REVIEWED",
        "Task",
        taskId,
        { from: TaskStatus.SUBMITTED, to: TaskStatus.REVIEW },
      );

      return updated;
    }

    if (task.status !== TaskStatus.REVIEW) {
      throw new BadRequestException(
        `Cannot review a task with status ${task.status}. Task must be SUBMITTED or REVIEW.`,
      );
    }

    const newStatus =
      dto.decision === ReviewDecision.APPROVE
        ? TaskStatus.COMPLETED
        : TaskStatus.REJECTED;

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus },
      include: {
        assignee: { select: { id: true, fullName: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    });

    // Notify the employee of the decision
    const notifType =
      dto.decision === ReviewDecision.APPROVE
        ? NotificationType.TASK_APPROVED
        : NotificationType.TASK_REJECTED;

    const message =
      dto.decision === ReviewDecision.APPROVE
        ? `Your task "${task.title}" has been approved! 🎉`
        : `Your task "${task.title}" has been rejected. Please rework and resubmit.`;

    await this.notifications.notify(task.assigneeId, notifType, message, taskId);

    // Record history
    await this.taskHistory.record(
      taskId,
      userId,
      TaskAction.REVIEWED,
      { status: TaskStatus.REVIEW },
      { status: newStatus, decision: dto.decision },
    );

    // Activity log
    await this.activityLog.logAction(
      userId,
      companyId,
      "TASK_REVIEWED",
      "Task",
      taskId,
      { from: TaskStatus.REVIEW, to: newStatus, decision: dto.decision },
    );

    return updated;
  }

  // ──────────────────────────────────────────────
  // Department Head: View all tasks across department teams
  // ──────────────────────────────────────────────

  async findDepartmentTasks(
    userId: string,
    companyId: string,
    role: Role,
    filters: TaskFilterDto,
  ) {
    let teamIds: string[];

    if (role === Role.CEO) {
      // CEO sees all tasks across all teams
      const teams = await this.prisma.team.findMany({
        where: { companyId },
        select: { id: true },
      });
      teamIds = teams.map((t) => t.id);
    } else {
      // Department head sees tasks across teams in their departments
      const departments = await this.prisma.department.findMany({
        where: { headId: userId, companyId },
        include: { teams: { select: { id: true } } },
      });

      teamIds = departments.flatMap((d) => d.teams.map((t) => t.id));
    }

    if (teamIds.length === 0) {
      return paginate([], 0, filters);
    }

    const filterConditions = this.buildTaskFilters(filters);
    const where: Prisma.TaskWhereInput = {
      ...filterConditions,
      teamId: { in: teamIds },
    };

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          assignee: { select: { id: true, fullName: true, email: true } },
          creator: { select: { id: true, fullName: true, email: true } },
          team: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(filters),
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginate(data, total, filters);
  }

  // ──────────────────────────────────────────────
  // Shared: Get a single task by ID
  // ──────────────────────────────────────────────

  async findOne(taskId: string, userId: string, role: Role, companyId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, fullName: true, email: true, role: true } },
        creator: { select: { id: true, fullName: true, email: true } },
        team: { select: { id: true, name: true, companyId: true, departmentId: true } },
        project: { select: { id: true, name: true } },
      },
    });

    if (!task) {
      throw new NotFoundException("Task not found");
    }

    // Company isolation: prevent cross-company access
    if ((task.team as any).companyId !== companyId) {
      throw new NotFoundException("Task not found");
    }

    // Employees can only view tasks assigned to them
    if (role === Role.EMPLOYEE && task.assigneeId !== userId) {
      throw new ForbiddenException("You can only view tasks assigned to you");
    }

    // Team leads can only view tasks in their team
    if (role === Role.TEAM_LEAD && task.creatorId !== userId) {
      // Check if they lead this team
      const team = await this.prisma.team.findUnique({
        where: { id: task.teamId },
      });
      if (!team || team.teamLeadId !== userId) {
        throw new ForbiddenException("You can only view tasks from your team");
      }
    }

    // Department heads can view tasks in teams within their department
    if (role === Role.DEPARTMENT_HEAD) {
      const teamDeptId = (task.team as any).departmentId;
      if (teamDeptId) {
        const dept = await this.prisma.department.findFirst({
          where: { id: teamDeptId, headId: userId },
        });
        if (!dept) {
          throw new ForbiddenException(
            "You can only view tasks in your department's teams",
          );
        }
      } else {
        throw new ForbiddenException(
          "This task's team is not assigned to any department",
        );
      }
    }

    return task;
  }

  // ──────────────────────────────────────────────
  // Private: Build dynamic filter conditions
  // ──────────────────────────────────────────────

  private buildTaskFilters(filters: TaskFilterDto): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    if (filters.search) {
      where.title = { contains: filters.search, mode: "insensitive" };
    }

    return where;
  }
}

