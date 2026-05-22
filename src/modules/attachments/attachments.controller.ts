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
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AttachmentsService } from "./attachments.service";
import { CreateAttachmentDto } from "./dto/create-attachment.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@ApiTags("Attachments")
@ApiBearerAuth("JWT")
@Controller("tasks/:taskId/attachments")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  /** List a task's attachments. */
  @ApiOperation({ summary: "List a task's attachments." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Get()
  findAll(@Param("taskId") taskId: string, @Request() req) {
    return this.attachmentsService.findByTask(
      taskId,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }

  /** Record an uploaded attachment (file already hosted, e.g. on Cloudinary). */
  @ApiOperation({ summary: "Attach an uploaded file to a task." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Post()
  create(
    @Param("taskId") taskId: string,
    @Body() dto: CreateAttachmentDto,
    @Request() req,
  ) {
    return this.attachmentsService.create(
      taskId,
      req.user.userId,
      req.user.role,
      req.user.companyId,
      dto,
    );
  }

  /** Delete an attachment (uploader or a manager). */
  @ApiOperation({ summary: "Delete an attachment." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Delete(":id")
  remove(
    @Param("taskId") taskId: string,
    @Param("id") id: string,
    @Request() req,
  ) {
    return this.attachmentsService.remove(
      taskId,
      id,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }
}
