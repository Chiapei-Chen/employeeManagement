import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  /** @example admin */
  // 帳號名稱一律以小寫儲存，登入時也轉小寫，Admin 與 admin 視為同一個帳號
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(1, 50)
  username: string;

  /** @example Admin@123 */
  @IsString()
  @Length(1, 100)
  password: string;
}
