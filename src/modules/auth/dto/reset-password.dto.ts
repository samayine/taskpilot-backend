import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class ResetPasswordDto {
  @ApiProperty({
    example: "9f2a1c...",
    description: "The raw reset token from the emailed link",
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: "newSecurePass123", minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  newPassword: string;
}
