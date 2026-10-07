import bcrypt from 'bcryptjs';

/**
 * 密碼雜湊與比對。整個專案只透過這兩個函式處理密碼，
 * 之後要調整 cost 或更換演算法，只需要改這個檔案。
 */

/** bcrypt 的運算成本 */
const BCRYPT_COST = 10;

/**
 * 帳號不存在時也跑一次 bcrypt 比對，讓「帳號不存在」與「密碼錯誤」的回應時間相近，
 * 避免攻擊者用回應時間差猜出哪些帳號存在（timing-based user enumeration）。
 */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * 比對密碼與雜湊值。
 * passwordHash 為 undefined（帳號不存在）時，仍會比對一次 DUMMY_HASH 再回傳 false。
 */
export async function verifyPassword(
  password: string,
  passwordHash: string | undefined,
): Promise<boolean> {
  const ok = await bcrypt.compare(password, passwordHash ?? DUMMY_HASH);
  return passwordHash !== undefined && ok;
}
