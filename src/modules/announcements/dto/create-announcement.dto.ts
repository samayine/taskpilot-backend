import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateCompanyAnnouncementDto {
  @ApiProperty({ example: "Q3 priorities for everyone" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({
    example:
      "Heads-up to the whole company — we're pivoting toward enterprise customers this quarter…",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  body: string;

  @ApiPropertyOptional({
    default: false,
    description: "Bubbles to the top of every employee's announcement feed.",
  })
  @IsBoolean()
  @IsOptional()
  pinned?: boolean;
}
