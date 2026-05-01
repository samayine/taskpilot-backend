import { IsNotEmpty, IsString, IsOptional, IsUUID } from "class-validator";

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  /**
   * The userId of the user who will lead this team.
   * Must be an existing user in the same company with role TEAM_LEAD.
   */
  @IsUUID()
  @IsNotEmpty()
  teamLeadId: string;
}
