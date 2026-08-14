/**
 * Platform floor price for a surprise bag — single named export, read from
 * everywhere a price-floor check is needed (bag-template.rules.ts's
 * validator; the DTO's own @Min, kept in sync by hand since class-validator
 * decorators can't reference a runtime const — see
 * dto/create-bag-template.dto.ts's comment).
 */
export const BAG_PRICE_FLOOR_CENTS = 5900;
