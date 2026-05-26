import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateAnnouncementDto {
  @ApiProperty({ example: "Standup tomorrow at 9 AM sharp." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  pinned?: boolean;
}
