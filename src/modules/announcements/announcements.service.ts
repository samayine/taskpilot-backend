import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";

import { PrismaService } from "src/prisma/prisma.service";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginate, paginateArgs } from "src/common/helpers/pagination.helper";
import { ActivityLogService } from "../activity-log/activity-log.service";
import { CreateCompanyAnnouncementDto } from "./dto/create-announcement.dto";
import { UpdateCompanyAnnouncementDto } from "./dto/update-announcement.dto";

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ───────────────────────────────────────────────────────────────
  // List company-wide announcements (any authenticated user, paginated;
  // pinned bubble to the top, then newest first).
  // ───────────────────────────────────────────────────────────────
  async list(companyId: string, pagination: PaginationDto) {
    const where: Prisma.CompanyAnnouncementWhereInput = { companyId };

    const [data, total] = await Promise.all([
      this.prisma.companyAnnouncement.findMany({
        where,
        include: {
          author: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        ...paginateArgs(pagination),
      }),
      this.prisma.companyAnnouncement.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  // ───────────────────────────────────────────────────────────────
  // Single announcement
  // ───────────────────────────────────────────────────────────────
  async findOne(id: string, companyId: string) {
    const ann = await this.prisma.companyAnnouncement.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });
    if (!ann || ann.companyId !== companyId) {
      throw new NotFoundException("Announcement not found");
    }
    return ann;
  }

  // ───────────────────────────────────────────────────────────────
  // CEO: create
  // ───────────────────────────────────────────────────────────────
  async create(
    dto: CreateCompanyAnnouncementDto,
    companyId: string,
    authorId: string,
  ) {
    const created = await this.prisma.companyAnnouncement.create({
      data: {
        title: dto.title,
        body: dto.body,
        pinned: dto.pinned ?? false,
        companyId,
        authorId,
      },
      include: {
        author: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    await this.activityLog.logAction(
      authorId,
      companyId,
      "COMPANY_ANNOUNCEMENT_CREATED",
      "CompanyAnnouncement",
      created.id,
      { title: created.title, pinned: created.pinned },
    );

    return created;
  }

  // ───────────────────────────────────────────────────────────────
  // CEO (author): update
  // ───────────────────────────────────────────────────────────────
  async update(
    id: string,
    dto: UpdateCompanyAnnouncementDto,
    companyId: string,
    callerId: string,
    callerRole: Role,
  ) {
    const ann = await this.prisma.companyAnnouncement.findUnique({
      where: { id },
    });
    if (!ann || ann.companyId !== companyId) {
      throw new NotFoundException("Announcement not found");
    }
    if (callerRole !== Role.CEO || ann.authorId !== callerId) {
      throw new ForbiddenException(
        "Only the CEO who posted this announcement can edit it.",
      );
    }

    return this.prisma.companyAnnouncement.update({
      where: { id },
      data: { ...dto },
      include: {
        author: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });
  }

  // ───────────────────────────────────────────────────────────────
  // CEO (author): delete
  // ───────────────────────────────────────────────────────────────
  async remove(
    id: string,
    companyId: string,
    callerId: string,
    callerRole: Role,
  ) {
    const ann = await this.prisma.companyAnnouncement.findUnique({
      where: { id },
    });
    if (!ann || ann.companyId !== companyId) {
      throw new NotFoundException("Announcement not found");
    }
    if (callerRole !== Role.CEO || ann.authorId !== callerId) {
      throw new ForbiddenException(
        "Only the CEO who posted this announcement can delete it.",
      );
    }

    await this.prisma.companyAnnouncement.delete({ where: { id } });

    await this.activityLog.logAction(
      callerId,
      companyId,
      "COMPANY_ANNOUNCEMENT_DELETED",
      "CompanyAnnouncement",
      id,
      { title: ann.title },
    );

    return { message: "Announcement deleted" };
  }
}
