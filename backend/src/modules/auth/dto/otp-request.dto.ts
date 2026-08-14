import { IsString, Matches, MaxLength } from "class-validator";
import { NormalizePhone } from "../../../common/dto/normalize-phone";

// Phone is normalized to E.164 (NormalizePhone) before validation, so
// callers can type any natural format ("0555 123 45 67", "+90 555 123 45
// 67") and it lands as "+905551234567". Port of kds's phone-field pattern
// (backend/src/modules/customers/dto/customer.dto.ts).
const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
const PHONE_MESSAGE = "Please enter a valid phone number.";

export class OtpRequestDto {
  @NormalizePhone("TR")
  @IsString()
  @Matches(PHONE_REGEX, { message: PHONE_MESSAGE })
  @MaxLength(20)
  phone!: string;
}
