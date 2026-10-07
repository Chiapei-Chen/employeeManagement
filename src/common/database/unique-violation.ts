import { QueryFailedError } from 'typeorm';

/**
 * 資料層的例外：違反 DB unique constraint。
 * 只描述「DB 發生了什麼」（哪個欄位重複），不帶業務錯誤碼、也不綁 HTTP，
 * 由 service 決定這代表哪一種業務錯誤。
 * field 是 entity 的屬性名稱（例如 employeeNo），service 不需要知道 DB 的欄位命名。
 */
export class UniqueConstraintException extends Error {
  constructor(readonly field: string) {
    super(`Unique constraint violated: ${field}`);
    this.name = 'UniqueConstraintException';
  }
}

/**
 * 從 DB 的 unique constraint 錯誤中找出是哪個欄位衝突。
 * 用途：service 先做的「是否重複」查詢擋不住同時送出的兩個請求（race condition），
 * 最後一道防線是 DB unique index。
 */
export function uniqueViolationColumn(error: unknown): string | null {
  if (!(error instanceof QueryFailedError)) return null;
  const driverError = error.driverError as
    { code?: string; message?: string } | undefined;
  if (driverError?.code !== 'SQLITE_CONSTRAINT_UNIQUE') return null;

  // SQLite: "UNIQUE constraint failed: employees.email"
  const match = /UNIQUE constraint failed: \w+\.(\w+)/.exec(
    driverError.message ?? '',
  );
  return match?.[1] ?? 'unknown';
}

/**
 * 給資料層使用：DB 的 unique 錯誤轉成 UniqueConstraintException，其他錯誤原樣回傳。
 * @param columnToField DB 欄位名稱 → entity 屬性名稱；不在表中的欄位視為未預期錯誤，原樣回傳
 */
export function toUniqueConstraintException(
  error: unknown,
  columnToField: Record<string, string>,
): unknown {
  const column = uniqueViolationColumn(error);
  const field = column ? columnToField[column] : undefined;
  return field ? new UniqueConstraintException(field) : error;
}
