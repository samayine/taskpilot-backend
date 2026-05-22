import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from "class-validator";

export class CreateAttachmentDto {
  @ApiProperty({ example: "design-mockup.png" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: "https://res.cloudinary.com/demo/image/upload/abc.png" })
  @IsUrl()
  fileUrl: string;

  @ApiPropertyOptional({ example: "image/png" })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  mimeType?: string;

  @ApiPropertyOptional({ example: 204800 })
  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;

  @ApiPropertyOptional({ example: "taskpilot/abc123" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  publicId?: string;
}
