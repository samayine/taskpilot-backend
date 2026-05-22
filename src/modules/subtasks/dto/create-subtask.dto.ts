import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateSubtaskDto {
  @ApiProperty({ example: "Write unit tests" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;
}
