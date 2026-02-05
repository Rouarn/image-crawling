import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { STORAGE_ROOT, ensureDir } from '../common/constants';

@Injectable()
export class ImagesService {
  findAll() {
    try {
      const root = STORAGE_ROOT;
      ensureDir(root);

      const exts = new Set([
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.webp',
        '.bmp',
        '.svg',
      ]);
      const groups = new Map<string, string[]>();

      const pushFile = (relPath: string, relBase: string) => {
        const top = relBase ? relBase.split('/')[0] : 'root';
        if (!groups.has(top)) groups.set(top, []);
        groups.get(top)!.push(relPath);
      };

      const walk = (dir: string, rel = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.name.startsWith('.')) continue;
          const abs = path.join(dir, ent.name);
          const relPath = rel ? `${rel}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            walk(abs, relPath);
          } else {
            const ext = path.extname(ent.name).toLowerCase();
            if (exts.has(ext)) pushFile(relPath, rel);
          }
        }
      };

      walk(root);

      const result = Array.from(groups.entries()).map(([dir, files]) => ({
        dir,
        files: (files || []).sort((a, b) => a.localeCompare(b)),
      }));

      result.sort((a, b) =>
        a.dir === 'root'
          ? -1
          : b.dir === 'root'
            ? 1
            : a.dir.localeCompare(b.dir),
      );

      const total = result.reduce((acc, g) => acc + g.files.length, 0);
      return { groups: result, total };
    } catch (e) {
      throw new InternalServerErrorException(
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  async remove(files: string[]) {
    try {
      const root = STORAGE_ROOT;
      for (const f of files) {
        const abs = path.join(root, f);
        // Prevent directory traversal
        if (!abs.startsWith(root)) continue;
        if (fs.existsSync(abs)) {
          await fs.promises.unlink(abs);
        }
      }
      return { success: true };
    } catch (e) {
      throw new InternalServerErrorException(
        e instanceof Error ? e.message : String(e),
      );
    }
  }
}
