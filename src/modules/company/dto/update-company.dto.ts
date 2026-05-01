import { IsOptional, IsString, MinLength } from "class-validator";

export class UpdateCompanyDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;
}
