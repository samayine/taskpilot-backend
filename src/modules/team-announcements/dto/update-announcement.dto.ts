import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateAnnouncementDto {
  @ApiPropertyOptional({ example: "Updated content." })
  @IsString()
  @IsOptional()
  @MaxLength(4000)
  content?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  pinned?: boolean;
}
