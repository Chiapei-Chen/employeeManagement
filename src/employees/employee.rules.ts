/**
 * 員工資料的業務規則，寫成不依賴 Nest / DB 的純函式：
 * - 規則集中一處，新增與修改共用
 * - 不用啟動 app、不用 mock repository 就能做 unit test
 */
import type { FieldError } from '../common/errors/error-codes.js';

export enum EmployeeStatus {
  Active = 'active',
  OnLeave = 'on_leave',
  Resigned = 'resigned',
}

/**
 * 允許的狀態轉換。resigned 視為終態：
 * 回任應建立新的任職紀錄，而不是把離職紀錄改回在職，否則會失去離職歷史。
 */
const ALLOWED_TRANSITIONS: Record<EmployeeStatus, readonly EmployeeStatus[]> = {
  [EmployeeStatus.Active]: [EmployeeStatus.OnLeave, EmployeeStatus.Resigned],
  [EmployeeStatus.OnLeave]: [EmployeeStatus.Active, EmployeeStatus.Resigned],
  [EmployeeStatus.Resigned]: [],
};

export function canTransition(from: EmployeeStatus, to: EmployeeStatus) {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

export interface EmployeeDates {
  status: EmployeeStatus;
  hireDate: string;
  resignationDate: string | null;
}

/**
 * 檢查「合併後」的資料是否一致。PATCH 只送部分欄位，
 * 所以必須拿「現有資料 + 這次變更」合併後的結果來檢查，而不是只看 request body。
 * 日期都是 YYYY-MM-DD，字串比較即等於日期比較。
 */
export function validateEmployeeDates(next: EmployeeDates): FieldError[] {
  const errors: FieldError[] = [];
  const isResigned = next.status === EmployeeStatus.Resigned;

  if (isResigned && !next.resignationDate) {
    errors.push({
      field: 'resignationDate',
      errors: ['resignationDate is required when status is resigned'],
    });
  }
  if (!isResigned && next.resignationDate) {
    errors.push({
      field: 'resignationDate',
      errors: ['resignationDate is only allowed when status is resigned'],
    });
  }
  if (next.resignationDate && next.resignationDate < next.hireDate) {
    errors.push({
      field: 'resignationDate',
      errors: ['resignationDate must not be earlier than hireDate'],
    });
  }
  return errors;
}
