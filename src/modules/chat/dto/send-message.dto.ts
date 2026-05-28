import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { CreateAttachmentDto } from "../../attachments/dto/create-attachment.dto";

export class SendMessageDto {
  // Text is optional when at least one attachment is present (validated in
  // the service).
  @ApiPropertyOptional({
    example: "Hello team, here's the update on the project.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional({
    type: [String],
    description: "User ids @mentioned in the message (must be channel members)",
  })
  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  mentionedUserIds?: string[];

  @ApiPropertyOptional({
    type: [CreateAttachmentDto],
    description: "Files attached to this message (already uploaded)",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAttachmentDto)
  attachments?: CreateAttachmentDto[];
}

export class EditMessageDto {
  @ApiProperty({ example: "Updated message text." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;
}

export class ReactDto {
  @ApiProperty({ example: "👍", description: "Emoji to toggle on the message" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  emoji: string;
}

export class MuteChannelDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  muted: boolean;
}
