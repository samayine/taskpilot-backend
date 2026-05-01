import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateTeamDto } from "./dto/create-team.dto";
import { AddTeamMemberDto } from "./dto/add-team-member.dto";
import { Role } from "@prisma/client";
import { ActivityLogService } from "../activity-log/activity-log.service";

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * CEO creates a new team within their company.
   * Validates that the designated team lead exists, belongs to the same company,
   * and has the TEAM_LEAD role.
   */
  async createTeam(dto: CreateTeamDto, companyId: string) {
    // Validate the team lead
    const teamLead = await this.prisma.user.findUnique({
      where: { id: dto.teamLeadId },
    });

    if (!teamLead) {
      throw new NotFoundException("Team lead user not found");
    }

    if (teamLead.companyId !== companyId) {
      throw new BadRequestException(
        "Team lead does not belong to your company",
      );
    }

    if (teamLead.role !== Role.TEAM_LEAD) {
      throw new BadRequestException(
        "Designated user does not have the TEAM_LEAD role",
      );
    }

    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        description: dto.description,
        companyId,
        teamLeadId: dto.teamLeadId,
      },
      include: {
        teamLead: { select: { id: true, fullName: true, email: true, role: true } },
      },
    });

    // Log team creation
    await this.activityLog.logAction(
      team.teamLead.id,
      companyId,
      "TEAM_CREATED",
      "Team",
      team.id,
      { teamName: team.name, teamLeadName: team.teamLead.fullName },
    );

    return team;
  }

  /**
   * Get all teams for a company.
   */
  async findAllByCompany(companyId: string) {
    return this.prisma.team.findMany({
      where: { companyId },
      include: {
        teamLead: { select: { id: true, fullName: true, email: true, role: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get a single team by ID (must belong to the same company).
   */
  async findOne(teamId: string, companyId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        teamLead: { select: { id: true, fullName: true, email: true, role: true } },
        members: {
          include: {
            user: { select: { id: true, fullName: true, email: true, role: true } },
          },
        },
      },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    return team;
  }

  /**
   * CEO adds a member to a team.
   * Validates that the user exists, belongs to the same company,
   * and is not already a member of this team.
   */
  async addMember(teamId: string, dto: AddTeamMemberDto, companyId: string) {
    // Validate the team exists and belongs to the company
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    // Validate the user exists and belongs to the same company
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.companyId !== companyId) {
      throw new BadRequestException("User does not belong to your company");
    }

    // Check for duplicate membership
    const existingMember = await this.prisma.teamMember.findUnique({
      where: {
        userId_teamId: { userId: dto.userId, teamId },
      },
    });

    if (existingMember) {
      throw new ConflictException("User is already a member of this team");
    }

    return this.prisma.teamMember.create({
      data: {
        userId: dto.userId,
        teamId,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
    });
  }

  /**
   * Remove a member from a team.
   */
  async removeMember(teamId: string, userId: string, companyId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team || team.companyId !== companyId) {
      throw new NotFoundException("Team not found");
    }

    const membership = await this.prisma.teamMember.findUnique({
      where: {
        userId_teamId: { userId, teamId },
      },
    });

    if (!membership) {
      throw new NotFoundException("User is not a member of this team");
    }

    await this.prisma.teamMember.delete({
      where: { id: membership.id },
    });

    return { message: "Member removed from team" };
  }
}
