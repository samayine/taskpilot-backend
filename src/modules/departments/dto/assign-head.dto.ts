import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsUUID } from "class-validator";

export class AssignHeadDto {
  @ApiProperty({
    example: "123e4567-e89b-12d3-a456-426614174000",
    description: "The userId of the user to assign as department head. Must have DEPARTMENT_HEAD role.",
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({
    description:
      "Replace the current head if this department already has one, or reassign the chosen user from a department they already head. Without this flag the API responds 409.",
  })
  @IsBoolean()
  @IsOptional()
  confirmOverwrite?: boolean;
}
