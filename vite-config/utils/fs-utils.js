import fs from 'fs';
import { join, resolve } from 'path';
import { PATHS } from '../config/paths.js';

/**
 * Рекурсивное копирование директории
 * @param {string} src - Исходная директория
 * @param {string} dest - Целевая директория
 */
export function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
    
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Поиск HTML файлов для точек входа
 * @returns {Object} Объект с точками входа
 */
export function findHtmlEntries() {
  const entries = {};
  if (!fs.existsSync(PATHS.app)) return entries;

  fs.readdirSync(PATHS.app)
    .filter(file => file.endsWith('.html'))
    .forEach(file => {
      const name = file.replace('.html', '');
      entries[name] = resolve(PATHS.app, file);
    });

  return entries;
}

/**
 * Собирает все файлы из директории для копирования
 * @param {string} src - Исходная директория
 * @param {string} dest - Целевая директория
 * @param {string} baseSrc - Базовая исходная директория
 * @param {string} baseDest - Базовая целевая директория
 * @returns {Array} Массив объектов с путями файлов
 */
export function collectFiles(src, dest, baseSrc, baseDest) {
  if (!fs.existsSync(src)) return [];
  
  let files = [];
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const relativePath = srcPath.replace(baseSrc, '').replace(/^[\/\\]/, '');
    const destPath = join(baseDest, relativePath);
    
    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      files = files.concat(collectFiles(srcPath, destPath, baseSrc, baseDest));
    } else {
      files.push({ src: srcPath, dest: destPath });
    }
  }
  
  return files;
} 