import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: "New Company Name" })
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;
}
