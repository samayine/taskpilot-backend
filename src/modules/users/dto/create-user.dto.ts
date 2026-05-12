import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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

  @ApiPropertyOptional({
    example: "securePass123",
    minLength: 6,
    description: "Optional — if omitted, a temporary password is auto-generated",
  })
  @IsString()
  @IsOptional()
  @MinLength(6, { message: "Password must be at least 6 characters long" })
  password?: string;

  @ApiProperty({
    enum: [Role.ASSISTANT, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE],
    example: "EMPLOYEE",
  })
  @IsIn([Role.ASSISTANT, Role.DEPARTMENT_HEAD, Role.TEAM_LEAD, Role.EMPLOYEE], {
    message: "Role must be ASSISTANT, DEPARTMENT_HEAD, TEAM_LEAD, or EMPLOYEE",
  })
  role: Role;

  @ApiPropertyOptional({
    example: "123e4567-e89b-12d3-a456-426614174000",
    description: "Department to assign this user to (for DEPARTMENT_HEAD role)",
  })
  @IsUUID()
  @IsOptional()
  departmentId?: string;
}
