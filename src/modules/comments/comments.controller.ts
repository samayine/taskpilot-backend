import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { CommentsService } from "./comments.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guards/roles.guard";
import { Roles } from "src/common/decorators/roles.decorator";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { Role } from "@prisma/client";

@ApiTags("Comments")
@ApiBearerAuth("JWT")
@Controller("tasks/:taskId/comments")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  /** Add a comment to a task. */
  @ApiOperation({ summary: "Add a comment to a task." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Post()
  create(
    @Param("taskId") taskId: string,
    @Body() dto: CreateCommentDto,
    @Request() req,
  ) {
    return this.commentsService.create(
      taskId,
      req.user.userId,
      req.user.role,
      req.user.companyId,
      dto,
    );
  }

  /** List users that can be @mentioned on this task. */
  @ApiOperation({ summary: "List users that can be @mentioned on this task." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Get("mentionable")
  mentionable(@Param("taskId") taskId: string, @Request() req) {
    return this.commentsService.getMentionable(
      taskId,
      req.user.userId,
      req.user.role,
      req.user.companyId,
    );
  }

  /** Get all comments on a task (paginated). */
  @ApiOperation({ summary: "Get all comments on a task (paginated)." })
  @Roles(Role.CEO, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE)
  @Get()
  findAll(
    @Param("taskId") taskId: string,
    @Query() pagination: PaginationDto,
    @Request() req,
  ) {
    return this.commentsService.findByTask(
      taskId,
      req.user.userId,
      req.user.role,
      req.user.companyId,
      pagination,
    );
  }
}
