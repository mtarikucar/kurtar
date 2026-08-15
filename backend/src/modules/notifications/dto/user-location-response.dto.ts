import { ApiProperty } from "@nestjs/swagger";

/** [Contract completion] UserLocationService.update — literal `{ok: true}`. */
export class UserLocationUpdateResponseDto {
  @ApiProperty({ enum: [true] }) ok!: true;
}
