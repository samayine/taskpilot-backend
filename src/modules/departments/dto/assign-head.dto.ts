import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";

export class AssignHeadDto {
  @ApiProperty({
    example: "123e4567-e89b-12d3-a456-426614174000",
    description: "The userId of the user to assign as department head. Must have DEPARTMENT_HEAD role.",
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}
