import { IsEnum, IsNotEmpty } from "class-validator";
import { TaskStatus } from "@prisma/client";

/**
 * Used by Employees to move their task through the lifecycle.
 * Valid transitions enforced in service:
 *   PENDING      → IN_PROGRESS
 *   IN_PROGRESS  → SUBMITTED
 *   REJECTED     → IN_PROGRESS
 */
export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus, { message: "Invalid task status" })
  @IsNotEmpty()
  status: TaskStatus;
}
