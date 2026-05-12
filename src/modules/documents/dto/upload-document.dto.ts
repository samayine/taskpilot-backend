import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DocumentVisibility } from "@prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class UploadDocumentDto {
  @ApiProperty({ example: "technical-spec.pdf" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  fileName: string;

  @ApiProperty({
    example: "https://storage.example.com/docs/technical-spec.pdf",
    description: "Cloud storage URL where the file is hosted",
  })
  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @ApiPropertyOptional({ example: 204800, description: "File size in bytes" })
  @IsNumber()
  @IsOptional()
  fileSize?: number;

  @ApiPropertyOptional({ example: "application/pdf" })
  @IsString()
  @IsOptional()
  mimeType?: string;

  @ApiPropertyOptional({
    example: "123e4567-e89b-12d3-a456-426614174000",
    description: "Project this document belongs to",
  })
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @ApiPropertyOptional({
    enum: DocumentVisibility,
    example: DocumentVisibility.ALL,
    description: "Visibility: ALL, DEPARTMENT_ONLY, or SPECIFIC",
  })
  @IsEnum(DocumentVisibility)
  @IsOptional()
  visibility?: DocumentVisibility;
}
