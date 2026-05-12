import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

export class GrantAccessDto {
  @ApiPropertyOptional({
    example: "123e4567-e89b-12d3-a456-426614174000",
    description: "Grant access to a specific user",
  })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({
    example: "123e4567-e89b-12d3-a456-426614174001",
    description: "Grant access to an entire team",
  })
  @IsUUID()
  @IsOptional()
  teamId?: string;

  @ApiPropertyOptional({
    example: "123e4567-e89b-12d3-a456-426614174002",
    description: "Grant access to an entire department",
  })
  @IsUUID()
  @IsOptional()
  departmentId?: string;
}
