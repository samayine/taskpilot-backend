import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Prisma, Role, TaskStatus } from "@prisma/client";

// Tight, single-purpose payloads per role. The frontend switches on `role`
// and renders just the cards relevant to it. No new tables — pure projection
// over Task / Notification / Comment / User / CommentMention.

const PAGE = 20;
const SMALL_PAGE = 10;

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  // Public entry — dispatches on role.
  async getHome(userId: string, role: Role, companyId: string) {
    switch (role) {
      case Role.EMPLOYEE:
        return this.employeeHome(userId, companyId);
      case Role.TEAM_LEAD:
        return this.teamLeadHome(userId, companyId);
      case Role.DEPARTMENT_HEAD:
        return this.deptHeadHome(userId, companyId);
      case Role.CEO:
        return this.ceoHome(userId, companyId);
      case Role.ASSISTANT:
        return this.assistantHome(userId, companyId);
    }
  }

  // ──────────────────────────────────────────────
  // EMPLOYEE: today / overdue / in-progress / up-next / mentions / watching
  // ──────────────────────────────────────────────

  private async employeeHome(userId: string, companyId: string) {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const baseInclude = {
      team: { select: { id: true, name: true, isShared: true } },
      taggedDepartment: { select: { id: true, name: true } },
      labels: { select: { id: true, name: true, color: true } },
    } as const;

    const activeNotTerminal = {
      notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] as TaskStatus[],
    };

    const [overdue, today, inProgress, upNext, mentions, watching] =
      await Promise.all([
        // Overdue: assigned to me, due in the past, not done.
        this.prisma.task.findMany({
          where: {
            assigneeId: userId,
            dueDate: { lt: startOfToday },
            status: activeNotTerminal,
          },
          include: baseInclude,
          orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
          take: PAGE,
        }),
        // Due today: assigned to me.
        this.prisma.task.findMany({
          where: {
            assigneeId: userId,
            dueDate: { gte: startOfToday, lte: endOfToday },
            status: activeNotTerminal,
          },
          include: baseInclude,
          orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
          take: PAGE,
        }),
        // In progress: assigned to me.
        this.prisma.task.findMany({
          where: { assigneeId: userId, status: TaskStatus.IN_PROGRESS },
          include: baseInclude,
          orderBy: [{ updatedAt: "desc" }],
          take: PAGE,
        }),
        // Up next: PENDING assigned to me.
        this.prisma.task.findMany({
          where: { assigneeId: userId, status: TaskStatus.PENDING },
          include: baseInclude,
          orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
          take: PAGE,
        }),
        // Mentions of me in comments (latest first).
        this.prisma.commentMention.findMany({
          where: { userId },
          include: {
            comment: {
              include: {
                author: { select: { id: true, fullName: true } },
                task: { select: { id: true, title: true } },
              },
            },
          },
          orderBy: { comment: { createdAt: "desc" } },
          take: SMALL_PAGE,
        }),
        // Watching: tasks I follow that are still active.
        this.prisma.taskWatcher.findMany({
          where: {
            userId,
            task: { status: activeNotTerminal, team: { companyId } },
          },
          include: { task: { include: baseInclude } },
          orderBy: { task: { updatedAt: "desc" } },
          take: SMALL_PAGE,
        }),
      ]);

    return {
      role: Role.EMPLOYEE,
      overdue,
      today,
      inProgress,
      upNext,
      mentions: mentions.map((m) => ({
        id: m.id,
        commentId: m.commentId,
        content: m.comment.content,
        createdAt: m.comment.createdAt,
        author: m.comment.author,
        task: m.comment.task,
      })),
      watching: watching.map((w) => w.task),
    };
  }

  // ──────────────────────────────────────────────
  // TEAM_LEAD: review queue / my tasks / workload per member
  // ──────────────────────────────────────────────

  private async teamLeadHome(userId: string, companyId: string) {
    const teams = await this.prisma.team.findMany({
      where: { teamLeadId: userId, companyId },
      select: { id: true, name: true },
    });
    const teamIds = teams.map((t) => t.id);

    const baseInclude = {
      assignee: { select: { id: true, fullName: true, email: true } },
      team: { select: { id: true, name: true, isShared: true } },
      labels: { select: { id: true, name: true, color: true } },
    } as const;

    if (teamIds.length === 0) {
      // Newly-promoted lead with no teams yet — still show their own work.
      const myTasks = await this.prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        },
        include: baseInclude,
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
        take: PAGE,
      });
      return {
        role: Role.TEAM_LEAD,
        teams,
        reviewQueue: [],
        myTasks,
        workload: [],
      };
    }

    const [reviewQueue, myTasks, members] = await Promise.all([
      // Tasks waiting on me to review (oldest first — most urgent).
      this.prisma.task.findMany({
        where: { teamId: { in: teamIds }, status: TaskStatus.REVIEW },
        include: baseInclude,
        orderBy: { updatedAt: "asc" },
        take: PAGE,
      }),
      // My own assigned tasks (a lead may still get assigned).
      this.prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        },
        include: baseInclude,
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
        take: SMALL_PAGE,
      }),
      // Workload: open task count per team member.
      this.prisma.teamMember.findMany({
        where: { teamId: { in: teamIds } },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
    ]);

    // Compute open + overdue counts per member.
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const memberIds = [...new Set(members.map((m) => m.userId))];
    const counts = memberIds.length
      ? await this.prisma.task.groupBy({
          by: ["assigneeId"],
          where: {
            assigneeId: { in: memberIds },
            teamId: { in: teamIds },
            status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
          },
          _count: true,
        })
      : [];
    const overdueCounts = memberIds.length
      ? await this.prisma.task.groupBy({
          by: ["assigneeId"],
          where: {
            assigneeId: { in: memberIds },
            teamId: { in: teamIds },
            status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
            dueDate: { lt: startOfToday },
          },
          _count: true,
        })
      : [];
    const openMap = new Map(
      counts.map((c) => [c.assigneeId, c._count as unknown as number]),
    );
    const overdueMap = new Map(
      overdueCounts.map((c) => [c.assigneeId, c._count as unknown as number]),
    );

    // Dedup members across teams.
    const seen = new Set<string>();
    const workload = members
      .filter((m) => {
        if (seen.has(m.userId)) return false;
        seen.add(m.userId);
        return true;
      })
      .map((m) => ({
        user: m.user,
        openCount: openMap.get(m.userId) ?? 0,
        overdueCount: overdueMap.get(m.userId) ?? 0,
      }))
      .sort((a, b) => b.openCount - a.openCount);

    return { role: Role.TEAM_LEAD, teams, reviewQueue, myTasks, workload };
  }

  // ──────────────────────────────────────────────
  // DEPARTMENT_HEAD: needs-attention / overdue-in-scope / team summaries
  // ──────────────────────────────────────────────

  private async deptHeadHome(userId: string, companyId: string) {
    const depts = await this.prisma.department.findMany({
      where: { headId: userId, companyId },
      include: { teams: { select: { id: true, name: true } } },
    });
    const teamIds = depts.flatMap((d) => d.teams.map((t) => t.id));
    const deptIds = depts.map((d) => d.id);

    const baseInclude = {
      assignee: { select: { id: true, fullName: true, email: true } },
      team: { select: { id: true, name: true, isShared: true } },
      labels: { select: { id: true, name: true, color: true } },
    } as const;

    if (teamIds.length === 0 && deptIds.length === 0) {
      return {
        role: Role.DEPARTMENT_HEAD,
        departments: [],
        needsAttention: [],
        overdue: [],
        teamSummaries: [],
      };
    }

    const inScopeWhere: Prisma.TaskWhereInput = {
      OR: [
        { teamId: { in: teamIds } },
        { team: { isShared: true }, taggedDepartmentId: { in: deptIds } },
      ],
    };

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const [needsAttention, overdue, summaryGroups] = await Promise.all([
      // REVIEW tasks in scope (review queue across the department).
      this.prisma.task.findMany({
        where: { ...inScopeWhere, status: TaskStatus.REVIEW },
        include: baseInclude,
        orderBy: { updatedAt: "asc" },
        take: PAGE,
      }),
      // Overdue in scope.
      this.prisma.task.findMany({
        where: {
          ...inScopeWhere,
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
          dueDate: { lt: startOfToday },
        },
        include: baseInclude,
        orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
        take: PAGE,
      }),
      // Per-team open + review + overdue counts.
      this.prisma.task.groupBy({
        by: ["teamId", "status"],
        where: {
          ...inScopeWhere,
          status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        },
        _count: { _all: true },
      }),
    ]);

    // Build per-team summaries.
    const teams = depts.flatMap((d) => d.teams);
    const teamSummaries = teams.map((t) => {
      const rows = summaryGroups.filter((g) => g.teamId === t.id);
      const open = rows.reduce(
        (sum, r) => sum + (r._count as unknown as number),
        0,
      );
      const review =
        rows.find((r) => r.status === TaskStatus.REVIEW)?._count ?? 0;
      return {
        team: t,
        openCount: open,
        reviewCount: review as unknown as number,
      };
    });

    return {
      role: Role.DEPARTMENT_HEAD,
      departments: depts.map((d) => ({ id: d.id, name: d.name })),
      needsAttention,
      overdue,
      teamSummaries,
    };
  }

  // ──────────────────────────────────────────────
  // CEO: company-wide attention + recent submits + throughput
  // ──────────────────────────────────────────────

  private async ceoHome(_userId: string, companyId: string) {
    const baseInclude = {
      assignee: { select: { id: true, fullName: true, email: true } },
      team: { select: { id: true, name: true, isShared: true } },
      labels: { select: { id: true, name: true, color: true } },
    } as const;

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [needsAttention, recentSubmits, completedThisWeek, openTotal] =
      await Promise.all([
        // REVIEW + overdue, anywhere in the company.
        this.prisma.task.findMany({
          where: {
            team: { companyId },
            OR: [
              { status: TaskStatus.REVIEW },
              {
                status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
                dueDate: { lt: startOfToday },
              },
            ],
          },
          include: baseInclude,
          orderBy: { updatedAt: "asc" },
          take: PAGE,
        }),
        // Recently submitted (latest REVIEW transitions).
        this.prisma.task.findMany({
          where: { team: { companyId }, status: TaskStatus.REVIEW },
          include: baseInclude,
          orderBy: { updatedAt: "desc" },
          take: SMALL_PAGE,
        }),
        this.prisma.task.count({
          where: {
            team: { companyId },
            status: TaskStatus.COMPLETED,
            updatedAt: { gte: weekAgo },
          },
        }),
        this.prisma.task.count({
          where: {
            team: { companyId },
            status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
          },
        }),
      ]);

    return {
      role: Role.CEO,
      needsAttention,
      recentSubmits,
      throughput: {
        completedThisWeek,
        openTotal,
      },
    };
  }

  // ──────────────────────────────────────────────
  // ASSISTANT: recently provisioned / blocked
  // ──────────────────────────────────────────────

  private async assistantHome(_userId: string, companyId: string) {
    const [recentlyProvisioned, blockedUsers, userCounts] = await Promise.all([
      this.prisma.user.findMany({
        where: { companyId },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isBlocked: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: SMALL_PAGE,
      }),
      this.prisma.user.findMany({
        where: { companyId, isBlocked: true },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: SMALL_PAGE,
      }),
      this.prisma.user.groupBy({
        by: ["role"],
        where: { companyId },
        _count: { _all: true },
      }),
    ]);

    const byRole = Object.fromEntries(
      userCounts.map((c) => [c.role, c._count as unknown as number]),
    ) as Record<string, number>;

    return {
      role: Role.ASSISTANT,
      recentlyProvisioned,
      blockedUsers,
      counts: {
        total: userCounts.reduce(
          (sum, c) => sum + (c._count as unknown as number),
          0,
        ),
        byRole,
      },
    };
  }
}
