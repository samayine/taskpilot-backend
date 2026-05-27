import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { PaginationDto } from "src/common/dto/pagination.dto";

export class ActivityLogFilterDto extends PaginationDto {
  /** Case-insensitive substring match on the `action` field. */
  @ApiPropertyOptional({ example: "TASK_" })
  @IsOptional()
  @IsString()
  action?: string;

  /** Exact match on `entityType` (e.g. "Task", "User", "Team"). */
  @ApiPropertyOptional({ example: "Task" })
  @IsOptional()
  @IsString()
  entityType?: string;

  /** Filter by the user who performed the action. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;
}
