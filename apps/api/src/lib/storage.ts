import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

/** Almacenamiento de archivos en disco local. Reemplazable por S3/MinIO implementando la misma interfaz. */
export interface Storage {
  save(buffer: Buffer, originalName: string, folder: string): Promise<string>;
  absolutePath(relPath: string): string;
  remove(relPath: string): Promise<void>;
}

class LocalStorage implements Storage {
  async save(buffer: Buffer, originalName: string, folder: string) {
    const ext = path.extname(originalName).toLowerCase() || '.jpg';
    const now = new Date();
    const dir = path.join(folder, `${now.getFullYear()}`, `${String(now.getMonth() + 1).padStart(2, '0')}`);
    await fs.mkdir(path.join(config.uploadDir, dir), { recursive: true });
    const rel = path.join(dir, `${crypto.randomUUID()}${ext}`);
    await fs.writeFile(path.join(config.uploadDir, rel), buffer);
    return rel;
  }

  absolutePath(relPath: string) {
    const abs = path.resolve(config.uploadDir, relPath);
    if (!abs.startsWith(config.uploadDir)) throw new Error('Ruta inválida');
    return abs;
  }

  async remove(relPath: string) {
    await fs.rm(this.absolutePath(relPath), { force: true });
  }
}

export const storage: Storage = new LocalStorage();
