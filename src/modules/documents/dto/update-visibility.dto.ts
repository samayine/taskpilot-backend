import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DocumentVisibility } from "@prisma/client";
import { IsEnum, IsNotEmpty } from "class-validator";

export class UpdateVisibilityDto {
  @ApiProperty({
    enum: DocumentVisibility,
    example: DocumentVisibility.DEPARTMENT_ONLY,
    description: "New visibility setting: ALL, DEPARTMENT_ONLY, or SPECIFIC",
  })
  @IsEnum(DocumentVisibility)
  @IsNotEmpty()
  visibility: DocumentVisibility;
}
