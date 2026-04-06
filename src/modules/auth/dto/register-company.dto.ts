import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class RegisterCompanyDto {
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsString()
  @IsNotEmpty()
  ceoFullName: string;

  @IsEmail()
  ceoEmail: string;

  @IsString()
  @MinLength(6, { message: "Password must be at least 6 characters long" })
  ceoPassword: string;
}
