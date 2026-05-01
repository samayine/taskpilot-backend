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
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: "Password must be at least 6 characters long" })
  password: string;

  @IsIn([Role.TEAM_LEAD, Role.EMPLOYEE], {
    message: "Role must be either TEAM_LEAD or EMPLOYEE",
  })
  role: Role;
}
