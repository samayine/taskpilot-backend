import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CreateProjectDto {
  @ApiProperty({ example: "Website Redesign" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: "Cross-department project for the new company website" })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    example: ["dept-uuid-1", "dept-uuid-2"],
    description: "Array of department IDs to link to this project",
  })
  @IsArray()
  @IsUUID("4", { each: true })
  departmentIds: string[];
}
