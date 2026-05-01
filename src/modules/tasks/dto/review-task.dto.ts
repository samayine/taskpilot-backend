import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty } from "class-validator";

/**
 * Decision the Team Lead makes when reviewing a submitted task.
 */
export enum ReviewDecision {
  APPROVE = "APPROVE",
  REJECT = "REJECT",
}

export class ReviewTaskDto {
  @ApiProperty({ enum: ReviewDecision, example: ReviewDecision.APPROVE })
  @IsEnum(ReviewDecision, { message: "Decision must be APPROVE or REJECT" })
  @IsNotEmpty()
  decision: ReviewDecision;
}
