import { PrismaClient, Role } from "@prisma/client";
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

  // 8. Add Sample Projects and Tasks
  let websiteProject = await prisma.project.findFirst({ where: { name: "Company Website V2", companyId: company.id } });
  if (!websiteProject) {
    websiteProject = await prisma.project.create({
      data: { name: "Company Website V2", companyId: company.id, creatorId: ceo.id },
    });
    
    // Only create tasks if the project is brand new to prevent duplicate tasks on multiple seed runs
    await prisma.task.create({
      data: {
        title: "Design new homepage layout",
        description: "Create a modern homepage design using React.",
        teamId: frontendTeam.id,
        creatorId: engHead.id,
        assigneeId: frontendLead.id,
        projectId: websiteProject.id,
        status: "IN_PROGRESS",
      },
    });

    await prisma.task.create({
      data: {
        title: "Setup API Gateway",
        description: "Implement API Gateway for microservices.",
        teamId: backendTeam.id,
        creatorId: engHead.id,
        assigneeId: backendLead.id,
        projectId: websiteProject.id,
        status: "PENDING",
      },
    });
    console.log("Created Projects & Tasks.");
  } else {
    console.log("Projects already exist, skipping task creation.");
  }

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
