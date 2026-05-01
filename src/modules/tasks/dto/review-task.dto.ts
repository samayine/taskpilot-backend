import { IsEnum, IsNotEmpty } from "class-validator";

/**
 * Decision the Team Lead makes when reviewing a submitted task.
 */
export enum ReviewDecision {
  APPROVE = "APPROVE",
  REJECT = "REJECT",
}

export class ReviewTaskDto {
  @IsEnum(ReviewDecision, { message: "Decision must be APPROVE or REJECT" })
  @IsNotEmpty()
  decision: ReviewDecision;
}
