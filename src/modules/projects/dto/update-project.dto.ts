import { ApiPropertyOptional } from "@nestjs/swagger";
import { ProjectStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateProjectDto {
  @ApiPropertyOptional({ example: "Website Redesign v2" })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: "Updated project description" })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: ProjectStatus, example: ProjectStatus.ON_HOLD })
  @IsEnum(ProjectStatus, {
    message: "Status must be ACTIVE, ON_HOLD, COMPLETED, or ARCHIVED",
  })
  @IsOptional()
  status?: ProjectStatus;
}
