import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";

/**
 * Shared by both MERCHANT and ADMIN email/password login — same shape,
 * same validation. Port of kds's backend/src/modules/auth/dto/login.dto.ts.
 */
export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254) // RFC 5321 SMTP local+domain limit
  email!: string;

  // bcryptjs processes the full input string before bcrypt's internal
  // 72-byte truncation kicks in, so a megabyte-long password takes seconds
  // to hash — cap defensively so the login throttle actually bounds CPU
  // spend, not just request count.
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
