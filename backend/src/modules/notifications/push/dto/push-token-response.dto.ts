import { ApiProperty } from "@nestjs/swagger";

/** [Contract completion] PushTokensService.register/remove — literal
 * `{ok: true}` / `{deleted: boolean}` respectively. */
export class PushTokenRegisterResponseDto {
  @ApiProperty({ enum: [true] }) ok!: true;
}

export class PushTokenRemoveResponseDto {
  @ApiProperty({
    description:
      "True if a token matching this user+value was actually removed.",
  })
  deleted!: boolean;
}
