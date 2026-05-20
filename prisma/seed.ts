import { PrismaClient, Role, TaskStatus, Priority } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcrypt";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  const defaultPassword = "password123";
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  // 1. Upsert Company
  let company = await prisma.company.findFirst({ where: { name: "Acme Corp" } });
  if (!company) {
    company = await prisma.company.create({
      data: { name: "Acme Corp" },
    });
  }
  console.log(`Company: ${company.name}`);

  // 2. Upsert CEO
  const ceo = await prisma.user.upsert({
    where: { email: "ceo@acmecorp.com" },
    update: {},
    create: {
      fullName: "Acme CEO",
      email: "ceo@acmecorp.com",
      password: hashedPassword,
      role: Role.CEO,
      companyId: company.id,
    },
  });
  console.log(`CEO: ${ceo.email}`);

  // 3. Upsert Assistant
  const assistant = await prisma.user.upsert({
    where: { email: "assistant@acmecorp.com" },
    update: {},
    create: {
      fullName: "Acme Assistant",
      email: "assistant@acmecorp.com",
      password: hashedPassword,
      role: Role.ASSISTANT,
      companyId: company.id,
    },
  });
  console.log(`Assistant: ${assistant.email}`);

  // 4. Upsert Departments
  const engDepartment = await prisma.department.upsert({
    where: { companyId_name: { companyId: company.id, name: "Engineering" } },
    update: {},
    create: {
      name: "Engineering",
      description: "Software Engineering & Development",
      companyId: company.id,
    },
  });
  const mktDepartment = await prisma.department.upsert({
    where: { companyId_name: { companyId: company.id, name: "Marketing" } },
    update: {},
    create: {
      name: "Marketing",
      description: "Marketing & Growth",
      companyId: company.id,
    },
  });
  console.log(`Departments: Engineering & Marketing`);

  // 5. Upsert Department Heads
  const engHead = await prisma.user.upsert({
    where: { email: "eng_head@acmecorp.com" },
    update: {},
    create: {
      fullName: "Jane Eng",
      email: "eng_head@acmecorp.com",
      password: hashedPassword,
      role: Role.DEPARTMENT_HEAD,
      companyId: company.id,
      departmentId: engDepartment.id,
    },
  });
  await prisma.department.update({
    where: { id: engDepartment.id },
    data: { headId: engHead.id },
  });

  const mktHead = await prisma.user.upsert({
    where: { email: "marketing_head@acmecorp.com" },
    update: {},
    create: {
      fullName: "Mike Mkt",
      email: "marketing_head@acmecorp.com",
      password: hashedPassword,
      role: Role.DEPARTMENT_HEAD,
      companyId: company.id,
      departmentId: mktDepartment.id,
    },
  });
  await prisma.department.update({
    where: { id: mktDepartment.id },
    data: { headId: mktHead.id },
  });
  console.log(`Department Heads assigned.`);

  // 6. Upsert Teams & Leads
  const frontendLead = await prisma.user.upsert({
    where: { email: "frontend_lead@acmecorp.com" },
    update: {},
    create: {
      fullName: "Alice Frontend",
      email: "frontend_lead@acmecorp.com",
      password: hashedPassword,
      role: Role.TEAM_LEAD,
      companyId: company.id,
      departmentId: engDepartment.id,
    },
  });
  let frontendTeam = await prisma.team.findFirst({ where: { name: "Frontend", companyId: company.id } });
  if (!frontendTeam) {
    frontendTeam = await prisma.team.create({
      data: {
        name: "Frontend",
        companyId: company.id,
        departmentId: engDepartment.id,
        teamLeadId: frontendLead.id,
      },
    });
  }

  const backendLead = await prisma.user.upsert({
    where: { email: "backend_lead@acmecorp.com" },
    update: {},
    create: {
      fullName: "Bob Backend",
      email: "backend_lead@acmecorp.com",
      password: hashedPassword,
      role: Role.TEAM_LEAD,
      companyId: company.id,
      departmentId: engDepartment.id,
    },
  });
  let backendTeam = await prisma.team.findFirst({ where: { name: "Backend", companyId: company.id } });
  if (!backendTeam) {
    backendTeam = await prisma.team.create({
      data: {
        name: "Backend",
        companyId: company.id,
        departmentId: engDepartment.id,
        teamLeadId: backendLead.id,
      },
    });
  }

  const contentLead = await prisma.user.upsert({
    where: { email: "content_lead@acmecorp.com" },
    update: {},
    create: {
      fullName: "Charlie Content",
      email: "content_lead@acmecorp.com",
      password: hashedPassword,
      role: Role.TEAM_LEAD,
      companyId: company.id,
      departmentId: mktDepartment.id,
    },
  });
  let contentTeam = await prisma.team.findFirst({ where: { name: "Content Creators", companyId: company.id } });
  if (!contentTeam) {
    contentTeam = await prisma.team.create({
      data: {
        name: "Content Creators",
        companyId: company.id,
        departmentId: mktDepartment.id,
        teamLeadId: contentLead.id,
      },
    });
  }
  console.log(`Teams & Leads assigned.`);

  // 7. Upsert Employees
  const employeesToCreate = [
    { name: "Frontend Emp 1", email: "fe_emp1@acmecorp.com", deptId: engDepartment.id, teamId: frontendTeam.id },
    { name: "Frontend Emp 2", email: "fe_emp2@acmecorp.com", deptId: engDepartment.id, teamId: frontendTeam.id },
    { name: "Backend Emp 1", email: "be_emp1@acmecorp.com", deptId: engDepartment.id, teamId: backendTeam.id },
    { name: "Backend Emp 2", email: "be_emp2@acmecorp.com", deptId: engDepartment.id, teamId: backendTeam.id },
    { name: "Content Emp 1", email: "content_emp1@acmecorp.com", deptId: mktDepartment.id, teamId: contentTeam.id },
    { name: "Content Emp 2", email: "content_emp2@acmecorp.com", deptId: mktDepartment.id, teamId: contentTeam.id },
  ];

  const emps: Record<string, { id: string }> = {};
  for (const empData of employeesToCreate) {
    const emp = await prisma.user.upsert({
      where: { email: empData.email },
      update: {},
      create: {
        fullName: empData.name,
        email: empData.email,
        password: hashedPassword,
        role: Role.EMPLOYEE,
        companyId: company.id,
        departmentId: empData.deptId,
      },
    });
    emps[empData.email] = emp;

    // Assign to team using upsert-like logic
    const member = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: emp.id, teamId: empData.teamId } },
    });
    if (!member) {
      await prisma.teamMember.create({
        data: { userId: emp.id, teamId: empData.teamId },
      });
    }
  }
  console.log("Employees assigned to teams.");

  // 8. Project (cross-department), idempotent
  let websiteProject = await prisma.project.findFirst({
    where: { name: "Company Website V2", companyId: company.id },
  });
  if (!websiteProject) {
    websiteProject = await prisma.project.create({
      data: {
        name: "Company Website V2",
        companyId: company.id,
        creatorId: ceo.id,
        departments: {
          create: [
            { departmentId: engDepartment.id },
            { departmentId: mktDepartment.id },
          ],
        },
      },
    });
  }

  // 9. Shared (cross-department) team, idempotent
  let launchSquad = await prisma.team.findFirst({
    where: { name: "Website Launch Squad", companyId: company.id },
  });
  if (!launchSquad) {
    launchSquad = await prisma.team.create({
      data: {
        name: "Website Launch Squad",
        description: "Cross-department squad driving the website launch",
        companyId: company.id,
        isShared: true,
        teamLeadId: frontendLead.id,
        sharedDepartments: {
          create: [
            { departmentId: engDepartment.id },
            { departmentId: mktDepartment.id },
          ],
        },
      },
    });
  }
  // Members from both departments
  for (const uid of [
    emps["fe_emp1@acmecorp.com"].id,
    emps["content_emp1@acmecorp.com"].id,
  ]) {
    const m = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: uid, teamId: launchSquad.id } },
    });
    if (!m)
      await prisma.teamMember.create({
        data: { userId: uid, teamId: launchSquad.id },
      });
  }
  console.log("Shared team ready.");

  // 10. Reset tasks (idempotent) — cascades clean comments/history/notifications
  await prisma.task.deleteMany({ where: { team: { companyId: company.id } } });

  const D = 86_400_000;
  const now = Date.now();

  type T = {
    title: string;
    description?: string;
    teamId: string;
    creatorId: string;
    assigneeId: string;
    status: TaskStatus;
    priority: Priority;
    due?: number; // ms offset from now (negative = overdue)
    deptId?: string;
    projectId?: string;
  };

  const taskSeed: T[] = [
    // ── Frontend team (Engineering) ──
    { title: "Design new homepage layout", description: "Modern, responsive homepage using React + Tailwind.", teamId: frontendTeam.id, creatorId: frontendLead.id, assigneeId: emps["fe_emp1@acmecorp.com"].id, status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH, due: 3 * D, deptId: engDepartment.id, projectId: websiteProject.id },
    { title: "Fix navbar responsiveness", description: "Navbar breaks below 360px.", teamId: frontendTeam.id, creatorId: frontendLead.id, assigneeId: emps["fe_emp2@acmecorp.com"].id, status: TaskStatus.PENDING, priority: Priority.MEDIUM, due: 5 * D, deptId: engDepartment.id },
    { title: "Build login & register pages", description: "Wire up auth forms with validation.", teamId: frontendTeam.id, creatorId: frontendLead.id, assigneeId: emps["fe_emp1@acmecorp.com"].id, status: TaskStatus.SUBMITTED, priority: Priority.URGENT, due: -1 * D, deptId: engDepartment.id, projectId: websiteProject.id },
    { title: "Refactor dashboard charts", description: "Swap to Recharts and memoize.", teamId: frontendTeam.id, creatorId: frontendLead.id, assigneeId: emps["fe_emp2@acmecorp.com"].id, status: TaskStatus.REVIEW, priority: Priority.MEDIUM, due: 2 * D, deptId: engDepartment.id },
    { title: "Set up shared component library", description: "Buttons, inputs, dialogs.", teamId: frontendTeam.id, creatorId: frontendLead.id, assigneeId: emps["fe_emp1@acmecorp.com"].id, status: TaskStatus.COMPLETED, priority: Priority.LOW, due: -4 * D, deptId: engDepartment.id },
    { title: "Dark mode color bug", description: "Contrast fails in dark mode on cards.", teamId: frontendTeam.id, creatorId: frontendLead.id, assigneeId: emps["fe_emp2@acmecorp.com"].id, status: TaskStatus.REJECTED, priority: Priority.HIGH, deptId: engDepartment.id },

    // ── Backend team (Engineering) ──
    { title: "Set up API Gateway", description: "Route microservices behind a gateway.", teamId: backendTeam.id, creatorId: backendLead.id, assigneeId: emps["be_emp1@acmecorp.com"].id, status: TaskStatus.PENDING, priority: Priority.HIGH, due: 6 * D, deptId: engDepartment.id, projectId: websiteProject.id },
    { title: "Database migration scripts", description: "Add idempotent migrations.", teamId: backendTeam.id, creatorId: backendLead.id, assigneeId: emps["be_emp2@acmecorp.com"].id, status: TaskStatus.IN_PROGRESS, priority: Priority.MEDIUM, due: 1 * D, deptId: engDepartment.id },
    { title: "Add request rate limiting", description: "Throttle auth endpoints.", teamId: backendTeam.id, creatorId: backendLead.id, assigneeId: emps["be_emp1@acmecorp.com"].id, status: TaskStatus.SUBMITTED, priority: Priority.URGENT, due: 0, deptId: engDepartment.id },
    { title: "Write integration tests", description: "Cover task lifecycle endpoints.", teamId: backendTeam.id, creatorId: backendLead.id, assigneeId: emps["be_emp2@acmecorp.com"].id, status: TaskStatus.REVIEW, priority: Priority.MEDIUM, due: 4 * D, deptId: engDepartment.id },
    { title: "Optimize slow queries", description: "Add indexes, remove N+1.", teamId: backendTeam.id, creatorId: backendLead.id, assigneeId: emps["be_emp1@acmecorp.com"].id, status: TaskStatus.COMPLETED, priority: Priority.LOW, due: -6 * D, deptId: engDepartment.id },

    // ── Content team (Marketing) ──
    { title: "Write Q3 blog series", description: "Four posts on product launches.", teamId: contentTeam.id, creatorId: contentLead.id, assigneeId: emps["content_emp1@acmecorp.com"].id, status: TaskStatus.IN_PROGRESS, priority: Priority.MEDIUM, due: 7 * D, deptId: mktDepartment.id },
    { title: "Launch monthly newsletter", description: "Template + first send.", teamId: contentTeam.id, creatorId: contentLead.id, assigneeId: emps["content_emp2@acmecorp.com"].id, status: TaskStatus.PENDING, priority: Priority.LOW, due: 10 * D, deptId: mktDepartment.id },
    { title: "Social media calendar", description: "Plan Q3 posts.", teamId: contentTeam.id, creatorId: contentLead.id, assigneeId: emps["content_emp1@acmecorp.com"].id, status: TaskStatus.SUBMITTED, priority: Priority.HIGH, due: -2 * D, deptId: mktDepartment.id },
    { title: "Brand guidelines doc", description: "Logo, colors, typography.", teamId: contentTeam.id, creatorId: contentLead.id, assigneeId: emps["content_emp2@acmecorp.com"].id, status: TaskStatus.COMPLETED, priority: Priority.MEDIUM, due: -8 * D, deptId: mktDepartment.id },

    // ── Shared team (cross-department, tagged) ──
    { title: "Landing page marketing copy", description: "Hero + features copy.", teamId: launchSquad.id, creatorId: frontendLead.id, assigneeId: emps["content_emp1@acmecorp.com"].id, status: TaskStatus.IN_PROGRESS, priority: Priority.HIGH, due: 2 * D, deptId: mktDepartment.id, projectId: websiteProject.id },
    { title: "Landing page build", description: "Implement the marketing landing page.", teamId: launchSquad.id, creatorId: frontendLead.id, assigneeId: emps["fe_emp1@acmecorp.com"].id, status: TaskStatus.SUBMITTED, priority: Priority.URGENT, due: 1 * D, deptId: engDepartment.id, projectId: websiteProject.id },
  ];

  const created: Record<string, { id: string }> = {};
  for (const t of taskSeed) {
    const task = await prisma.task.create({
      data: {
        title: t.title,
        description: t.description,
        teamId: t.teamId,
        creatorId: t.creatorId,
        assigneeId: t.assigneeId,
        status: t.status,
        priority: t.priority,
        dueDate: t.due === undefined ? null : new Date(now + t.due),
        taggedDepartmentId: t.deptId ?? null,
        projectId: t.projectId ?? null,
      },
    });
    created[t.title] = task;
  }
  console.log(`Created ${taskSeed.length} tasks across all statuses.`);

  // 11. Comments + history on a couple of tasks for a rich detail view
  const loginTask = created["Build login & register pages"];
  if (loginTask) {
    await prisma.comment.createMany({
      data: [
        { taskId: loginTask.id, authorId: emps["fe_emp1@acmecorp.com"].id, content: "Submitted for review — added Zod validation and error toasts." },
        { taskId: loginTask.id, authorId: frontendLead.id, content: "Thanks! Reviewing now, will check the password rules." },
      ],
    });
    await prisma.taskHistory.createMany({
      data: [
        { taskId: loginTask.id, changedById: frontendLead.id, action: "CREATED", newValue: { status: "PENDING" } },
        { taskId: loginTask.id, changedById: emps["fe_emp1@acmecorp.com"].id, action: "STATUS_CHANGED", oldValue: { status: "PENDING" }, newValue: { status: "IN_PROGRESS" } },
        { taskId: loginTask.id, changedById: emps["fe_emp1@acmecorp.com"].id, action: "STATUS_CHANGED", oldValue: { status: "IN_PROGRESS" }, newValue: { status: "SUBMITTED" } },
      ],
    });
  }
  console.log("Sample comments & history added.");

  console.log("Seeding finished.");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
