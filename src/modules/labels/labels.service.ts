import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateLabelDto } from "./dto/create-label.dto";
import { UpdateLabelDto } from "./dto/update-label.dto";

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string) {
    return this.prisma.label.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
    });
  }

  async create(companyId: string, dto: CreateLabelDto) {
    const exists = await this.prisma.label.findUnique({
      where: { companyId_name: { companyId, name: dto.name } },
    });
    if (exists) {
      throw new ConflictException("A label with this name already exists");
    }
    return this.prisma.label.create({
      data: { companyId, name: dto.name, color: dto.color ?? "gray" },
    });
  }

  async update(id: string, companyId: string, dto: UpdateLabelDto) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label || label.companyId !== companyId) {
      throw new NotFoundException("Label not found");
    }
    if (dto.name && dto.name !== label.name) {
      const clash = await this.prisma.label.findUnique({
        where: { companyId_name: { companyId, name: dto.name } },
      });
      if (clash) throw new ConflictException("A label with this name already exists");
    }
    return this.prisma.label.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.color !== undefined && { color: dto.color }),
      },
    });
  }

  async remove(id: string, companyId: string) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label || label.companyId !== companyId) {
      throw new NotFoundException("Label not found");
    }
    await this.prisma.label.delete({ where: { id } });
    return { message: "Label deleted" };
  }
}
