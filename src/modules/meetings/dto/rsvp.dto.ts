import { ApiProperty } from "@nestjs/swagger";
import { MeetingRsvp } from "@prisma/client";
import { IsEnum } from "class-validator";

export class RsvpDto {
  @ApiProperty({ enum: MeetingRsvp, example: MeetingRsvp.ACCEPTED })
  @IsEnum(MeetingRsvp)
  rsvp: MeetingRsvp;
}

export class CancelMeetingDto {
  @ApiProperty({ required: false })
  reason?: string;
}
