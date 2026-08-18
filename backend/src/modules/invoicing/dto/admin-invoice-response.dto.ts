import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EDocType, InvoiceStatus, InvoiceType } from "@prisma/client";

/** [Cross-lane fix, M16] One row of the admin commission-invoice queue.
 *
 * Deliberately NOT the full CommissionInvoice model: `linesJson` (the
 * itemized UBL payload) and `ublXmlRef` are never rendered by the queue
 * and would put every reservation id in a merchant's period into a list
 * response. `merchantTradeName` is joined in because an operator chasing a
 * stuck e-fatura needs to know WHOSE it is without a second lookup. */
export class AdminCommissionInvoiceItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() merchantId!: string;
  @ApiProperty() merchantTradeName!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) batchId!:
    string | null;
  @ApiProperty({ enum: InvoiceType }) type!: InvoiceType;
  @ApiProperty({ enum: EDocType }) docType!: EDocType;
  @ApiProperty({ enum: InvoiceStatus }) status!: InvoiceStatus;
  @ApiPropertyOptional({ nullable: true, type: String }) nilveraDocId!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: Date }) issuedAt!: Date | null;
  @ApiProperty() netAmountCents!: number;
  @ApiProperty() vatCents!: number;
  @ApiProperty() totalAmountCents!: number;
  @ApiProperty() createdAt!: Date;
}

/** GET /api/admin/invoices */
export class AdminCommissionInvoiceListResponseDto {
  @ApiProperty({ type: [AdminCommissionInvoiceItemDto] })
  items!: AdminCommissionInvoiceItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

/** POST /api/admin/invoices/{id}/reissue — the re-issue attempt's outcome.
 * `status` is the invoice's status AFTER the attempt, so a caller can
 * refresh one row rather than the whole queue. */
export class AdminCommissionInvoiceReissueResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: InvoiceStatus }) status!: InvoiceStatus;
  @ApiPropertyOptional({ nullable: true, type: String }) nilveraDocId!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: Date }) issuedAt!: Date | null;
}
