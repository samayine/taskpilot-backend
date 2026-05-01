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
import { Role, TaskStatus } from "@prisma/client";

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
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.task.create({
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
        team: { select: { id: true, name: true } },
      },
    });
  }

  // ──────────────────────────────────────────────
  // Team Lead: View all tasks for their team
  // ──────────────────────────────────────────────

  async findTeamTasks(userId: string, companyId: string) {
    // Find all teams this user leads
    const teams = await this.prisma.team.findMany({
      where: { teamLeadId: userId, companyId },
      select: { id: true },
    });

    const teamIds = teams.map((t) => t.id);

    return this.prisma.task.findMany({
      where: { teamId: { in: teamIds } },
      include: {
        assignee: { select: { id: true, fullName: true, email: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ──────────────────────────────────────────────
  // Employee: View my assigned tasks
  // ──────────────────────────────────────────────

  async findMyTasks(userId: string) {
    return this.prisma.task.findMany({
      where: { assigneeId: userId },
      include: {
        team: { select: { id: true, name: true } },
        creator: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ──────────────────────────────────────────────
  // Employee: Update task status (strict lifecycle)
  // ──────────────────────────────────────────────

  async updateStatus(
    taskId: string,
    dto: UpdateTaskStatusDto,
    userId: string,
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

    return this.prisma.task.update({
      where: { id: taskId },
      data: { status: dto.status },
      include: {
        team: { select: { id: true, name: true } },
      },
    });
  }

  // ──────────────────────────────────────────────
  // Team Lead: Review a submitted task
  // ──────────────────────────────────────────────

  async reviewTask(taskId: string, dto: ReviewTaskDto, userId: string) {
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
      return this.prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.REVIEW },
        include: {
          assignee: { select: { id: true, fullName: true, email: true } },
          team: { select: { id: true, name: true } },
        },
      });
    }

    if (task.status !== TaskStatus.REVIEW) {
      throw new BadRequestException(
        `Cannot review a task with status ${task.status}. Task must be SUBMITTED or REVIEW.`,
      );
    }

    // Apply the decision
    const newStatus =
      dto.decision === ReviewDecision.APPROVE
        ? TaskStatus.COMPLETED
        : TaskStatus.REJECTED;

    return this.prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus },
      include: {
        assignee: { select: { id: true, fullName: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    });
  }

  // ──────────────────────────────────────────────
  // Shared: Get a single task by ID
  // ──────────────────────────────────────────────

  async findOne(taskId: string, userId: string, role: Role) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, fullName: true, email: true, role: true } },
        creator: { select: { id: true, fullName: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    });

    if (!task) {
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

    return task;
  }
}
