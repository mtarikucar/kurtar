import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const COMMENT_MAX_LENGTH = 1000;

export class CreateRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  overallStars!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  foodQuality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  service?: number;

  @IsOptional()
  @IsString()
  @MaxLength(COMMENT_MAX_LENGTH)
  comment?: string;
}
