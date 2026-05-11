import { ApiProperty } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateUserDto {
  @ApiProperty({ example: "Jane Smith" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: "jane@company.com" })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: "securePass123", minLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: "Password must be at least 6 characters long" })
  password: string;

  @ApiProperty({ enum: [Role.ASSISTANT, Role.TEAM_LEAD, Role.EMPLOYEE], example: "EMPLOYEE" })
  @IsIn([Role.ASSISTANT, Role.TEAM_LEAD, Role.EMPLOYEE], {
    message: "Role must be ASSISTANT, TEAM_LEAD, or EMPLOYEE",
  })
  role: Role;
}
