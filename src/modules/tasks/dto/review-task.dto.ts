import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

/**
 * Decision the reviewer makes when reviewing a submitted task.
 */
export enum ReviewDecision {
  APPROVE = "APPROVE",
  REJECT = "REJECT",
}

export class ReviewTaskDto {
  /**
   * Required only for the REVIEW → COMPLETED/REJECTED step.
   * Omit it to move a SUBMITTED task into REVIEW.
   */
  @ApiPropertyOptional({ enum: ReviewDecision, example: ReviewDecision.APPROVE })
  @IsEnum(ReviewDecision, { message: "Decision must be APPROVE or REJECT" })
  @IsOptional()
  decision?: ReviewDecision;
}
