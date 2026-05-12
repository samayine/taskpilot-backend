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
  ) {
    // CEO sees everything
    if (role === Role.CEO) {
      return this.findDocuments({ companyId }, pagination);
    }

    // For other roles, build visibility-aware query
    // They can see:
    // 1. Documents with visibility ALL
    // 2. Documents they uploaded
    // 3. Documents where they have an explicit access rule
    // 4. DEPARTMENT_ONLY docs if they're in that department
    const userTeams = await this.prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true, team: { select: { departmentId: true } } },
    });

    const teamIds = userTeams.map((tm) => tm.teamId);
    const departmentIds = userTeams
      .map((tm) => tm.team.departmentId)
      .filter((id): id is string => id !== null);

    // Also check if user heads any departments
    const headedDepts = await this.prisma.department.findMany({
      where: { headId: userId, companyId },
      select: { id: true },
    });
    const headedDeptIds = headedDepts.map((d) => d.id);
    const allDeptIds = [...new Set([...departmentIds, ...headedDeptIds])];

    const where: Prisma.DocumentWhereInput = {
      companyId,
      OR: [
        // Documents visible to all
        { visibility: DocumentVisibility.ALL },
        // Documents uploaded by this user
        { uploaderId: userId },
        // Documents with SPECIFIC visibility where user has access
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
        // DEPARTMENT_ONLY docs where user is in that department
        {
          visibility: DocumentVisibility.DEPARTMENT_ONLY,
          uploader: {
            teamMembers: {
              some: {
                team: {
                  departmentId: { in: allDeptIds },
                },
              },
            },
          },
        },
      ],
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
}
