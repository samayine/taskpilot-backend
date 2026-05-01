import { IsNotEmpty, IsUUID } from "class-validator";

export class AddTeamMemberDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}
