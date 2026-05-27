import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { DocumentsService } from "./documents.service";
import { UploadTeamDocumentDto } from "./dto/upload-team-document.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";

@ApiTags("TeamDocuments")
@ApiBearerAuth("JWT")
@Controller("teams/:teamId/documents")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamDocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /** List documents attached to a team's hub (any team viewer). */
  @ApiOperation({ summary: "List documents attached to a team's hub." })
  @Roles(
    Role.CEO,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
    Role.ASSISTANT,
  )
  @Get()
  list(@Param("teamId") teamId: string, @Request() req) {
    return this.documentsService.listByTeam(
      teamId,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }

  /** Upload a document to a team's hub (any team viewer). */
  @ApiOperation({ summary: "Upload a document to a team's hub." })
  @Roles(
    Role.CEO,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
    Role.ASSISTANT,
  )
  @Post()
  create(
    @Param("teamId") teamId: string,
    @Body() dto: UploadTeamDocumentDto,
    @Request() req,
  ) {
    return this.documentsService.createForTeam(
      teamId,
      req.user.userId,
      req.user.role,
      req.user.companyId,
      dto,
    );
  }

  /** Delete a team document (uploader or team manager). */
  @ApiOperation({ summary: "Delete a team document." })
  @Roles(
    Role.CEO,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
    Role.ASSISTANT,
  )
  @Delete(":id")
  remove(
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @Request() req,
  ) {
    return this.documentsService.removeFromTeam(
      teamId,
      id,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }
}
