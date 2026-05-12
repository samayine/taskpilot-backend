import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ChannelType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateChannelDto {
  @ApiProperty({ example: "Engineering Chat" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    enum: ChannelType,
    example: ChannelType.PROJECT,
    description: "Channel type: PROJECT, DEPARTMENT, DIRECT, or ANNOUNCEMENT",
  })
  @IsEnum(ChannelType)
  @IsOptional()
  type?: ChannelType;

  @ApiPropertyOptional({
    example: "123e4567-e89b-12d3-a456-426614174000",
    description: "Project ID to link this channel to (for PROJECT type channels)",
  })
  @IsUUID()
  @IsOptional()
  projectId?: string;
}
