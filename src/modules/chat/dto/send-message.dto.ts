import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class SendMessageDto {
  @ApiProperty({ example: "Hello team, here's the update on the project." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;
}
