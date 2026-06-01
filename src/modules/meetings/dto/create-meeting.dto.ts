import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MeetingScope, Role } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  ValidateIf,
} from "class-validator";

export class CreateMeetingDto {
  @ApiProperty({ example: "Q1 alignment sync" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: "Roadmap, OKR check-in, blockers." })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  agenda?: string;

  @ApiPropertyOptional({ example: "https://meet.google.com/abc-defg-hij" })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  link?: string;

  @ApiPropertyOptional({ example: "Boardroom A" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiProperty({ example: "2026-04-12T14:00:00.000Z" })
  @IsDateString()
  startsAt: string;

  @ApiPropertyOptional({ example: "2026-04-12T15:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiProperty({ enum: MeetingScope, example: MeetingScope.TEAM })
  @IsEnum(MeetingScope)
  scope: MeetingScope;

  /** Required when scope === ROLE — picks the target role group. */
  @ApiPropertyOptional({ enum: Role })
  @ValidateIf((o: CreateMeetingDto) => o.scope === MeetingScope.ROLE)
  @IsEnum(Role)
  targetRole?: Role;

  /** Required when scope === DEPARTMENT. */
  @ApiPropertyOptional()
  @ValidateIf((o: CreateMeetingDto) => o.scope === MeetingScope.DEPARTMENT)
  @IsUUID()
  targetDepartmentId?: string;

  /** Required when scope === TEAM. */
  @ApiPropertyOptional()
  @ValidateIf((o: CreateMeetingDto) => o.scope === MeetingScope.TEAM)
  @IsUUID()
  targetTeamId?: string;

  /** Optional override; defaults to the caller. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hostId?: string;
}
