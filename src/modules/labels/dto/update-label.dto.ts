import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { LABEL_COLORS } from "./create-label.dto";

export class UpdateLabelDto {
  @ApiPropertyOptional({ example: "bug" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;

  @ApiPropertyOptional({ enum: LABEL_COLORS })
  @IsOptional()
  @IsIn(LABEL_COLORS)
  color?: string;
}
