import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";

export class OpenDirectDto {
  @ApiProperty({
    example: "123e4567-e89b-12d3-a456-426614174000",
    description: "The user to open a 1:1 DM channel with.",
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}
