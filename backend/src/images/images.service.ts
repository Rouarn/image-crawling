import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { STORAGE_ROOT, ensureDir } from '../common/constants';

@Injectable()
export class ImagesService {
  /**
   * 扫描存储目录，获取所有图片文件并按目录分组
   * @returns 包含分组信息和总图片数的对象
   */
  findAll() {
    try {
      const root = STORAGE_ROOT;
      ensureDir(root);

      // 支持的图片扩展名集合
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

      /**
       * 将文件添加到对应的分组中
       * @param relPath 相对路径
       * @param relBase 相对基础路径
       */
      const pushFile = (relPath: string, relBase: string) => {
        const top = relBase ? relBase.split('/')[0] : 'root';
        if (!groups.has(top)) groups.set(top, []);
        groups.get(top)!.push(relPath);
      };

      /**
       * 递归遍历目录
       * @param dir 当前绝对路径
       * @param rel 当前相对路径
       */
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

      // 转换为数组并排序
      const result = Array.from(groups.entries()).map(([dir, files]) => ({
        dir,
        files: (files || []).sort((a, b) => a.localeCompare(b)),
      }));

      // 对分组进行排序：root 排在最前/最后，其他按字母顺序
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

  /**
   * 删除指定的图片文件列表
   * @param files 要删除的文件相对路径列表
   * @returns 操作结果
   */
  async remove(files: string[]) {
    try {
      const root = STORAGE_ROOT;
      for (const f of files) {
        const abs = path.join(root, f);
        // 防止目录遍历攻击
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
