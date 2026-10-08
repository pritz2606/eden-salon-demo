import { Transform, Type } from 'class-transformer';
import { IsDefined, IsEmail, IsObject, IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value;

export class DateQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

export class SlotsQueryDto extends DateQueryDto {
  @IsString()
  @Matches(/^[a-z0-9-]{1,60}$/)
  serviceId!: string;

  @IsString()
  @Matches(/^[a-z0-9-]{1,60}$/)
  staffId!: string;
}

export class CustomerDto {
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  @Matches(/^[\p{L}\p{N}\s.'-]+$/u)
  name!: string;

  @Transform(lower)
  @IsEmail()
  @MaxLength(150)
  email!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9 ()-]{8,20}$/)
  phone!: string;
}

export class CreateBookingDto extends SlotsQueryDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  time!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CustomerDto)
  customer!: CustomerDto;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{16,128}$/)
  idempotencyKey!: string;
}

export class ReferenceDto {
  @IsString()
  @Matches(/^EDN-[A-F0-9]{10}$/)
  reference!: string;
}

export class LoginDto {
  @Transform(lower)
  @IsEmail()
  @MaxLength(150)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
