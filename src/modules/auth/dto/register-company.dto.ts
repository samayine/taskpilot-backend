import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class RegisterCompanyDto {
  @ApiProperty({ example: "Acme Corp" })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiProperty({ example: "John Doe" })
  @IsString()
  @IsNotEmpty()
  ceoFullName: string;

  @ApiProperty({ example: "john@acmecorp.com" })
  @IsEmail()
  ceoEmail: string;

  @ApiProperty({ example: "securePass123", minLength: 6 })
  @IsString()
  @MinLength(6, { message: "Password must be at least 6 characters long" })
  ceoPassword: string;
}
