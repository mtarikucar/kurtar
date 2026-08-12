import { IsString, Length, Matches, MaxLength } from "class-validator";
import { NormalizePhone } from "../../../common/dto/normalize-phone";

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
const PHONE_MESSAGE = "Please enter a valid phone number.";

export class OtpVerifyDto {
  @NormalizePhone("TR")
  @IsString()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  @MaxLength(20)
  phone!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
