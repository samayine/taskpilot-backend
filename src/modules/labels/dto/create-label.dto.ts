import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export const LABEL_COLORS = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;

export class CreateLabelDto {
  @ApiProperty({ example: "bug" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;

  @ApiPropertyOptional({ enum: LABEL_COLORS, example: "blue" })
  @IsOptional()
  @IsIn(LABEL_COLORS)
  color?: string;
}
