import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";
import { Platform } from "@prisma/client";

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  expoPushToken!: string;

  @IsEnum(Platform)
  platform!: Platform;
}
