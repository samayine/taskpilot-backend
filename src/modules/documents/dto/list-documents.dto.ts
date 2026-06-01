import { ApiPropertyOptional } from "@nestjs/swagger";
import { DocumentVisibility } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { PaginationDto } from "src/common/dto/pagination.dto";

export class ListDocumentsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: DocumentVisibility })
  @IsOptional()
  @IsEnum(DocumentVisibility)
  visibility?: DocumentVisibility;

  @ApiPropertyOptional({ description: "Only documents I uploaded" })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ description: "Search by file name" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
