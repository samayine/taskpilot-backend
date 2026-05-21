import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { Priority } from "@prisma/client";

/**
 * Used by a team lead / department head / CEO to edit a task after creation.
 * Changing `assigneeId` reassigns the task (validated as an EMPLOYEE member
 * of the task's team).
 */
export class UpdateTaskDto {
  @ApiPropertyOptional({ example: "Build the login page" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: "Use React Hook Form + Zod." })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority, { message: "Priority must be LOW, MEDIUM, HIGH, or URGENT" })
  priority?: Priority;

  @ApiPropertyOptional({ example: "2026-06-30T23:59:59Z" })
  @IsOptional()
  @IsDateString({}, { message: "dueDate must be a valid ISO date string" })
  dueDate?: string;

  @ApiPropertyOptional({ description: "Reassign the task to another employee" })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
