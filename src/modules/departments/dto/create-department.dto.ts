import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateDepartmentDto {
  @ApiProperty({ example: "Engineering" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: "Software engineering and development" })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
