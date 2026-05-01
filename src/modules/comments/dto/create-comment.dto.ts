import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateCommentDto {
  @ApiProperty({ example: "I have pushed the changes to the repository." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
