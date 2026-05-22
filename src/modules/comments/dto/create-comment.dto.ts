import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { CreateAttachmentDto } from "../../attachments/dto/create-attachment.dto";

export class CreateCommentDto {
  @ApiPropertyOptional({ example: "I have pushed the changes." })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({
    type: [String],
    description: "User ids @mentioned in the comment (notified if participants)",
  })
  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  mentionedUserIds?: string[];

  @ApiPropertyOptional({
    type: [CreateAttachmentDto],
    description: "Files attached to this comment (already uploaded)",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAttachmentDto)
  attachments?: CreateAttachmentDto[];
}
