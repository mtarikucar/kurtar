import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

/**
 * POST /api/merchants/me/submit body. `sttAttestationAccepted` and
 * `intermediationAccepted` must both be `true` in THIS request for the
 * submit to succeed — the brief's "required before submit (400 with
 * explicit code if not accepted)" is enforced by merchants.service.ts
 * checking these booleans and writing Merchant.sttAttestationAcceptedAt /
 * intermediationAcceptedAt / intermediationContractVersion at the moment
 * of submit, not by a separate prior "accept" endpoint (none exists in
 * this task's brief).
 *
 * `docsJson` is URLs/refs only (no file upload in this task, per the
 * brief) — validated as a plain object and stored verbatim on the
 * MerchantVerificationEvent row for this transition.
 */
export class MerchantSubmitDto {
  @IsOptional()
  @IsObject()
  docsJson?: Record<string, unknown>;

  @IsBoolean()
  sttAttestationAccepted!: boolean;

  @IsBoolean()
  intermediationAccepted!: boolean;

  @IsString()
  @MaxLength(50)
  intermediationContractVersion!: string;
}
