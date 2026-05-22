import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CreateCommentDto {
  @ApiProperty({ example: "I have pushed the changes to the repository." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({
    type: [String],
    description: "User ids @mentioned in the comment (notified if participants)",
  })
  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  mentionedUserIds?: string[];
}
