import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsOptional, IsUUID } from "class-validator";

export class CreateTeamDto {
  @ApiProperty({ example: "Engineering Team" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: "Backend and Frontend development team" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: "Engineering", description: "Department this team belongs to" })
  @IsString()
  @IsOptional()
  department?: string;

  /**
   * The userId of the user who will lead this team.
   * Must be an existing user in the same company with role TEAM_LEAD.
   */
  @ApiProperty({ example: "123e4567-e89b-12d3-a456-426614174000" })
  @IsUUID()
  @IsNotEmpty()
  teamLeadId: string;
}
