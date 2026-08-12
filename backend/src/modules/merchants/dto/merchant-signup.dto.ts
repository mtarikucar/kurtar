import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * POST /api/merchants/signup body. taxId/iban get their own semantic
 * checks (isValidTaxId / isValidIban) in the service, not here — DTO-level
 * validators only cover shape (non-empty, length caps); the business
 * rules live in one place (merchants.service.ts) so their error codes stay
 * explicit and testable independent of class-validator's generic 400
 * shape.
 */
export class MerchantSignupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  legalName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  tradeName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(11)
  taxId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(34)
  iban!: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email!: string;

  // Mirrors LoginDto's 128 cap (bcrypt-before-truncation CPU bound); a
  // MinLength is added here (unlike LoginDto, which validates an EXISTING
  // credential, not a new one) since this is where the credential is
  // actually chosen.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  ownerName!: string;
}
