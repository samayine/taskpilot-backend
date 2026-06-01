import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { UploadDocumentDto } from "./dto/upload-document.dto";
import { UpdateVisibilityDto } from "./dto/update-visibility.dto";
import { GrantAccessDto } from "./dto/grant-access.dto";
import { UploadTeamDocumentDto } from "./dto/upload-team-document.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginateArgs, paginate } from "src/common/helpers/pagination.helper";
import { DocumentVisibility, Prisma, Role } from "@prisma/client";

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // Upload/register a document
  // ──────────────────────────────────────────────

  async create(dto: UploadDocumentDto, companyId: string, userId: string) {
    // Validate project if provided
    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
      });
      if (!project || project.companyId !== companyId) {
        throw new NotFoundException("Project not found");
      }
    }

    const document = await this.prisma.document.create({
      data: {
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        projectId: dto.projectId,
        visibility: dto.visibility ?? DocumentVisibility.ALL,
        uploaderId: userId,
        companyId,
      },
      include: {
        uploader: { select: { id: true, fullName: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

    return document;
  }

  // ──────────────────────────────────────────────
  // List documents (filtered by visibility)
  // ──────────────────────────────────────────────

  async findAll(
    companyId: string,
    userId: string,
    role: Role,
    pagination: PaginationDto,
    filters: {
      visibility?: DocumentVisibility;
      mine?: boolean;
      search?: string;
    } = {},
  ) {
    const extra: Prisma.DocumentWhereInput[] = [];
    if (filters.visibility) extra.push({ visibility: filters.visibility });
    if (filters.mine) extra.push({ uploaderId: userId });
    if (filters.search?.trim()) {
      extra.push({
        fileName: { contains: filters.search.trim(), mode: "insensitive" },
      });
    }

    // CEO sees everything (subject to optional filters above).
    if (role === Role.CEO) {
      const where: Prisma.DocumentWhereInput = { companyId };
      if (extra.length > 0) where.AND = extra;
      return this.findDocuments(where, pagination);
    }

    // For other roles, build visibility-aware query
    const userTeams = await this.prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true, team: { select: { departmentId: true } } },
    });

    const teamIds = userTeams.map((tm) => tm.teamId);
    const departmentIds = userTeams
      .map((tm) => tm.team.departmentId)
      .filter((id): id is string => id !== null);

    const headedDepts = await this.prisma.department.findMany({
      where: { headId: userId, companyId },
      select: { id: true },
    });
    const headedDeptIds = headedDepts.map((d) => d.id);
    const allDeptIds = [...new Set([...departmentIds, ...headedDeptIds])];

    const accessOr: Prisma.DocumentWhereInput[] = [
      { teamId: null, visibility: DocumentVisibility.ALL },
      { uploaderId: userId },
      { teamId: { in: teamIds } },
      {
        visibility: DocumentVisibility.SPECIFIC,
        accessRules: {
          some: {
            OR: [
              { userId },
              { teamId: { in: teamIds } },
              { departmentId: { in: allDeptIds } },
            ],
          },
        },
      },
      {
        visibility: DocumentVisibility.DEPARTMENT_ONLY,
        uploader: {
          teamMembers: {
            some: { team: { departmentId: { in: allDeptIds } } },
          },
        },
      },
    ];

    const where: Prisma.DocumentWhereInput = {
      companyId,
      AND: [{ OR: accessOr }, ...extra],
    };

    return this.findDocuments(where, pagination);
  }

  // ──────────────────────────────────────────────
  // Get a single document (with visibility check)
  // ──────────────────────────────────────────────

  async findOne(documentId: string, companyId: string, userId: string, role: Role) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        uploader: { select: { id: true, fullName: true, email: true } },
        project: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        accessRules: true,
      },
    });

    if (!document || document.companyId !== companyId) {
      throw new NotFoundException("Document not found");
    }

    // CEO can see everything
    if (role === Role.CEO) {
      return document;
    }

    // Owner can always see their own documents
    if (document.uploaderId === userId) {
      return document;
    }

    // Check visibility
    const hasAccess = await this.checkAccess(document, userId, companyId);
    if (!hasAccess) {
      throw new ForbiddenException("You do not have access to this document");
    }

    return document;
  }

  // ──────────────────────────────────────────────
  // Update visibility
  // ──────────────────────────────────────────────

  async updateVisibility(
    documentId: string,
    dto: UpdateVisibilityDto,
    companyId: string,
    userId: string,
    role: Role,
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document || document.companyId !== companyId) {
      throw new NotFoundException("Document not found");
    }

    // Only the owner, CEO, or a lead can change visibility
    if (role !== Role.CEO && document.uploaderId !== userId) {
      throw new ForbiddenException("Only the document owner or CEO can change visibility");
    }

    return this.prisma.document.update({
      where: { id: documentId },
      data: { visibility: dto.visibility },
      include: {
        uploader: { select: { id: true, fullName: true, email: true } },
        accessRules: true,
      },
    });
  }

  // ──────────────────────────────────────────────
  // Grant access to specific users/teams/departments
  // ──────────────────────────────────────────────

  async grantAccess(
    documentId: string,
    dto: GrantAccessDto,
    companyId: string,
    userId: string,
    role: Role,
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document || document.companyId !== companyId) {
      throw new NotFoundException("Document not found");
    }

    // Only owner or CEO can grant access
    if (role !== Role.CEO && document.uploaderId !== userId) {
      throw new ForbiddenException("Only the document owner or CEO can grant access");
    }

    if (!dto.userId && !dto.teamId && !dto.departmentId) {
      throw new BadRequestException(
        "At least one of userId, teamId, or departmentId must be provided",
      );
    }

    const accessRule = await this.prisma.documentAccessRule.create({
      data: {
        documentId,
        userId: dto.userId,
        teamId: dto.teamId,
        departmentId: dto.departmentId,
      },
    });

    return accessRule;
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  private async findDocuments(
    where: Prisma.DocumentWhereInput,
    pagination: PaginationDto,
  ) {
    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        include: {
          uploader: { select: { id: true, fullName: true, email: true } },
          project: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
          _count: { select: { accessRules: true } },
        },
        orderBy: { createdAt: "desc" },
        ...paginateArgs(pagination),
      }),
      this.prisma.document.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  private async checkAccess(
    document: any,
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    // Team-scoped doc: any member of the team can view it
    if (document.teamId) {
      const member = await this.prisma.teamMember.findUnique({
        where: { userId_teamId: { userId, teamId: document.teamId } },
      });
      return !!member;
    }

    if (document.visibility === DocumentVisibility.ALL) {
      return true;
    }

    if (document.visibility === DocumentVisibility.SPECIFIC) {
      // Check explicit access rules
      const userTeams = await this.prisma.teamMember.findMany({
        where: { userId },
        select: { teamId: true, team: { select: { departmentId: true } } },
      });

      const teamIds = userTeams.map((tm) => tm.teamId);
      const departmentIds = userTeams
        .map((tm) => tm.team.departmentId)
        .filter((id): id is string => id !== null);

      const rule = await this.prisma.documentAccessRule.findFirst({
        where: {
          documentId: document.id,
          OR: [
            { userId },
            { teamId: { in: teamIds } },
            { departmentId: { in: departmentIds } },
          ],
        },
      });

      return !!rule;
    }

    if (document.visibility === DocumentVisibility.DEPARTMENT_ONLY) {
      // Check if user is in the same department as the uploader
      const uploaderTeams = await this.prisma.teamMember.findMany({
        where: { userId: document.uploaderId },
        select: { team: { select: { departmentId: true } } },
      });

      const uploaderDeptIds = uploaderTeams
        .map((tm) => tm.team.departmentId)
        .filter((id): id is string => id !== null);

      if (uploaderDeptIds.length === 0) return false;

      const userTeams = await this.prisma.teamMember.findMany({
        where: { userId },
        select: { team: { select: { departmentId: true } } },
      });

      const userDeptIds = userTeams
        .map((tm) => tm.team.departmentId)
        .filter((id): id is string => id !== null);

      // Check overlap
      return uploaderDeptIds.some((id) => userDeptIds.includes(id));
    }

    return false;
  }

  // ──────────────────────────────────────────────
  // Team-scoped documents (project hub)
  // ──────────────────────────────────────────────

  /**
   * Resolve the team and check that the caller can view it: CEO, the team's
   * lead, a dept-head over the team's department (or a shared dept), or any
   * team member.
   */
  private async assertTeamViewer(
    teamId: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        companyId: true,
        teamLeadId: true,
        departmentId: true,
        isShared: true,
      },
    });
    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }
    if (role === Role.CEO) return team;
    if (team.teamLeadId === userId) return team;
    if (role === Role.DEPARTMENT_HEAD) {
      const headed = await this.prisma.department.findMany({
        where: { headId: userId, companyId },
        select: { id: true },
      });
      const ids = new Set(headed.map((d) => d.id));
      const ok = team.isShared
        ? (
            await this.prisma.teamDepartment.findMany({
              where: { teamId: team.id },
              select: { departmentId: true },
            })
          ).some((sd) => ids.has(sd.departmentId))
        : !!team.departmentId && ids.has(team.departmentId);
      if (ok) return team;
    }
    const member = await this.prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (member) return team;
    throw new ForbiddenException("You do not have access to this team");
  }

  /** Whether the caller can manage the team (delete other people's docs). */
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
      if (team.isShared) {
        const shared = await this.prisma.teamDepartment.findMany({
          where: { teamId: team.id },
          select: { departmentId: true },
        });
        return shared.some((sd) => ids.has(sd.departmentId));
      }
      return !!team.departmentId && ids.has(team.departmentId);
    }
    return false;
  }

  /** List documents attached to a team's hub. Any team viewer. */
  async listByTeam(
    teamId: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    await this.assertTeamViewer(teamId, userId, role, companyId);
    return this.prisma.document.findMany({
      where: { teamId, companyId },
      include: {
        uploader: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Upload a document to a team's hub. Any team viewer. */
  async createForTeam(
    teamId: string,
    userId: string,
    role: Role,
    companyId: string,
    dto: UploadTeamDocumentDto,
  ) {
    await this.assertTeamViewer(teamId, userId, role, companyId);
    return this.prisma.document.create({
      data: {
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        teamId,
        uploaderId: userId,
        companyId,
        // Team-scoped docs ignore visibility; default ALL keeps the column happy.
        visibility: DocumentVisibility.ALL,
      },
      include: {
        uploader: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  /** Delete a team document. Uploader or a team manager. */
  async removeFromTeam(
    teamId: string,
    documentId: string,
    userId: string,
    role: Role,
    companyId: string,
  ) {
    const team = await this.assertTeamViewer(teamId, userId, role, companyId);
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, teamId: true, uploaderId: true, companyId: true },
    });
    if (!doc || doc.teamId !== teamId || doc.companyId !== companyId) {
      throw new NotFoundException("Document not found");
    }
    const isUploader = doc.uploaderId === userId;
    if (!isUploader && !(await this.canManageTeam(team, userId, role))) {
      throw new ForbiddenException(
        "Only the uploader or a team manager can delete this document",
      );
    }
    await this.prisma.document.delete({ where: { id: documentId } });
    return { message: "Document deleted" };
  }
}
