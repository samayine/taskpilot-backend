import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsDateString,
} from "class-validator";
import { Priority } from "@prisma/client";

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(Priority, { message: "Priority must be LOW, MEDIUM, HIGH, or URGENT" })
  @IsOptional()
  priority?: Priority;

  @IsDateString({}, { message: "dueDate must be a valid ISO date string" })
  @IsOptional()
  dueDate?: string;

  /**
   * The employee to assign this task to.
   * Must be a member of the team lead's team with EMPLOYEE role.
   */
  @IsUUID()
  @IsNotEmpty()
  assigneeId: string;

  /**
   * The team this task belongs to.
   * Must be a team that the current team lead manages.
   */
  @IsUUID()
  @IsNotEmpty()
  teamId: string;
}
