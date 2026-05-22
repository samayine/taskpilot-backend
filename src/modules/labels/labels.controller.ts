import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { LabelsService } from "./labels.service";
import { CreateLabelDto } from "./dto/create-label.dto";
import { UpdateLabelDto } from "./dto/update-label.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@ApiTags("Labels")
@ApiBearerAuth("JWT")
@Controller("labels")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  /** List all labels in the company. */
  @ApiOperation({ summary: "List company labels." })
  @Roles(
    Role.CEO,
    Role.ASSISTANT,
    Role.DEPARTMENT_HEAD,
    Role.TEAM_LEAD,
    Role.EMPLOYEE,
  )
  @Get()
  findAll(@Request() req) {
    return this.labelsService.findAll(req.user.companyId);
  }

  /** Create a label (managers). */
  @ApiOperation({ summary: "Create a label." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Post()
  create(@Body() dto: CreateLabelDto, @Request() req) {
    return this.labelsService.create(req.user.companyId, dto);
  }

  /** Edit a label (managers). */
  @ApiOperation({ summary: "Edit a label." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateLabelDto, @Request() req) {
    return this.labelsService.update(id, req.user.companyId, dto);
  }

  /** Delete a label (managers). */
  @ApiOperation({ summary: "Delete a label." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD)
  @Delete(":id")
  remove(@Param("id") id: string, @Request() req) {
    return this.labelsService.remove(id, req.user.companyId);
  }
}
