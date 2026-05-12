import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { DocumentsService } from "./documents.service";
import { UploadDocumentDto } from "./dto/upload-document.dto";
import { UpdateVisibilityDto } from "./dto/update-visibility.dto";
import { GrantAccessDto } from "./dto/grant-access.dto";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@ApiTags("Documents")
@ApiBearerAuth("JWT")
@Controller("documents")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /** Any authenticated user registers a document (metadata + URL). */
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE, Role.ASSISTANT)
  @Post()
  create(@Body() dto: UploadDocumentDto, @Request() req) {
    return this.documentsService.create(
      dto,
      req.user.companyId,
      req.user.userId,
    );
  }

  /** List documents the user can access (visibility-filtered). */
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE, Role.ASSISTANT)
  @Get()
  findAll(@Query() pagination: PaginationDto, @Request() req) {
    return this.documentsService.findAll(
      req.user.companyId,
      req.user.userId,
      req.user.role,
      pagination,
    );
  }

  /** Get a single document (checks visibility rules). */
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE, Role.ASSISTANT)
  @Get(":id")
  findOne(@Param("id") id: string, @Request() req) {
    return this.documentsService.findOne(
      id,
      req.user.companyId,
      req.user.userId,
      req.user.role,
    );
  }

  /** Owner or CEO changes document visibility. */
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Patch(":id/visibility")
  updateVisibility(
    @Param("id") id: string,
    @Body() dto: UpdateVisibilityDto,
    @Request() req,
  ) {
    return this.documentsService.updateVisibility(
      id,
      dto,
      req.user.companyId,
      req.user.userId,
      req.user.role,
    );
  }

  /** Owner or CEO grants access to specific users/teams/departments. */
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Post(":id/access")
  grantAccess(
    @Param("id") id: string,
    @Body() dto: GrantAccessDto,
    @Request() req,
  ) {
    return this.documentsService.grantAccess(
      id,
      dto,
      req.user.companyId,
      req.user.userId,
      req.user.role,
    );
  }
}
