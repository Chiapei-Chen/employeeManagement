import { InitSchema1759800000000 } from './1759800000000-init-schema.js';
import { AddUserPasswordChangedAt1759900000000 } from './1759900000000-add-user-password-changed-at.js';

/** 依時間順序列出所有 migration（ESM 下不使用 glob 字串載入，改為明確 import） */
export const migrations = [
  InitSchema1759800000000,
  AddUserPasswordChangedAt1759900000000,
];
