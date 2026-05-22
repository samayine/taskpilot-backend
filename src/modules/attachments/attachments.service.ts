import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Role } from "@prisma/client";
import { CreateAttachmentDto } from "./dto/create-attachment.dto";

@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Whether a user may act as lead on a team (CEO, the team's lead, or a dept
  // head over the team / a shared team involving one of their departments).
  private async canManageTeam(
    team: {
      id: string;
      teamLeadId: string;
      departmentId: string | null;
      isShared: boolean;
    },
    userId: string,
    role: Role,
  ): Promise<boolean> {
    if (role === Role.CEO) return true;
    if (team.teamLeadId === userId) return true;
    if (role === Role.DEPARTMENT_HEAD) {
      const headed = await this.prisma.department.findMany({
        where: { headId: userId },
        select: { id: true },
      });
      const ids = new Set(headed.map((d) => d.id));
      if (!team.isShared) return !!team.departmentId && ids.has(team.departmentId);
      const shared = await this.prisma.teamDepartment.findMany({
        where: { teamId: team.id },
        select: { departmentId: true },
      });
      return shared.some((sd) => ids.has(sd.departmentId));
    }
    return false;
  }

  // Verify the caller may view a task (assignee, creator, or a manager over it)
  // and return the task with its team.
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
            id: true,
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
      return task;
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
      if (ok) return task;
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
    // Task-level attachments only; comment attachments render inline in the thread
    return this.prisma.taskAttachment.findMany({
      where: { taskId, commentId: null },
      include: {
        uploadedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(
    taskId: string,
    userId: string,
    role: Role,
    companyId: string,
    dto: CreateAttachmentDto,
  ) {
    await this.assertCanAccess(taskId, userId, role, companyId);
    return this.prisma.taskAttachment.create({
      data: {
        taskId,
        uploadedById: userId,
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
        publicId: dto.publicId,
      },
      include: {
        uploadedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  // Delete: the uploader, or anyone who can manage the task's team.
  async remove(
    taskId: string,
    attachmentId: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    const task = await this.assertCanAccess(taskId, userId, role, companyId);
    const attachment = await this.prisma.taskAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment || attachment.taskId !== taskId) {
      throw new NotFoundException("Attachment not found");
    }
    const isUploader = attachment.uploadedById === userId;
    if (!isUploader && !(await this.canManageTeam(task.team, userId, role))) {
      throw new ForbiddenException(
        "Only the uploader or a manager can delete this attachment",
      );
    }
    await this.prisma.taskAttachment.delete({ where: { id: attachmentId } });
    return { message: "Attachment removed" };
  }
}
