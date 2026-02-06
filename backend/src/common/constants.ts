import * as path from 'node:path';
import * as fs from 'node:fs';

export const STORAGE_ROOT = path.resolve(process.cwd(), '../storage');

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
