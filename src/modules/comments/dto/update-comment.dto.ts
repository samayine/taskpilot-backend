import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

// Edit only changes text. Attachments/mentions are immutable for now —
// the user can delete and repost if they need to restructure.
export class UpdateCommentDto {
  @ApiProperty({ example: "Fixed the typo." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
