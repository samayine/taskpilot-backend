import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty } from "class-validator";

export class ForgotPasswordDto {
  @ApiProperty({ example: "john@company.com" })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
