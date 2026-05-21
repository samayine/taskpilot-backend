import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsEnum, IsUUID } from "class-validator";
import { TaskStatus } from "@prisma/client";

/**
 * Persist the manual order of a board column. `orderedIds` is the full,
 * top-to-bottom list of task ids in the given status column.
 */
export class ReorderTasksDto {
  @ApiProperty({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  status: TaskStatus;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  orderedIds: string[];
}
