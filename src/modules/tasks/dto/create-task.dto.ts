import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
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
  @ApiProperty({ example: "Implement login page" })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: "Build the login page using React and Tailwind CSS." })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: Priority, example: Priority.MEDIUM })
  @IsEnum(Priority, { message: "Priority must be LOW, MEDIUM, HIGH, or URGENT" })
  @IsOptional()
  priority?: Priority;

  @ApiPropertyOptional({ example: "2023-12-31T23:59:59Z" })
  @IsDateString({}, { message: "dueDate must be a valid ISO date string" })
  @IsOptional()
  dueDate?: string;

  /**
   * The employee to assign this task to.
   * Must be a member of the team lead's team with EMPLOYEE role.
   */
  @ApiProperty({ example: "123e4567-e89b-12d3-a456-426614174000" })
  @IsUUID()
  @IsNotEmpty()
  assigneeId: string;

  /**
   * The team this task belongs to.
   * Must be a team that the current team lead manages.
   */
  @ApiProperty({ example: "123e4567-e89b-12d3-a456-426614174001" })
  @IsUUID()
  @IsNotEmpty()
  teamId: string;

  /**
   * Optional: link this task to a project.
   */
  @ApiPropertyOptional({
    example: "123e4567-e89b-12d3-a456-426614174002",
    description: "Project this task is part of (for cross-department projects)",
  })
  @IsUUID()
  @IsOptional()
  projectId?: string;

  /**
   * Optional: tag which department this task belongs to (in cross-dept projects).
   */
  @ApiPropertyOptional({
    example: "Engineering",
    description: "Department tag for filtering in cross-department projects",
  })
  @IsString()
  @IsOptional()
  departmentTag?: string;
}
