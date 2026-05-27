import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

/** Body for `POST /teams/:teamId/documents`. */
export class UploadTeamDocumentDto {
  @ApiProperty({ example: "spec.pdf" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  fileName: string;

  @ApiProperty({ example: "https://res.cloudinary.com/.../spec.pdf" })
  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @ApiPropertyOptional({ example: 204800 })
  @IsNumber()
  @IsOptional()
  fileSize?: number;

  @ApiPropertyOptional({ example: "application/pdf" })
  @IsString()
  @IsOptional()
  mimeType?: string;
}
