import fs from 'fs';
import { resolve, join } from 'path';
import sharp from 'sharp';
import { PATHS } from '../config/paths.js';
import { escapeCodeAndPre, unescapeCodeAndPre } from '../utils/html-utils.js';
import { CONSOLE_COLORS } from '../config/constants.js';

/**
 * Плагин для исправления путей к шрифтам в CSS
 * @returns {Object} Vite плагин
 */
export function fixFontPathsPlugin() {
  return {
    name: 'fix-font-paths',
    apply: 'build',
    closeBundle: async () => {
      try {
        const cssDir = join(PATHS.dist, 'css');
        if (!fs.existsSync(cssDir)) return;

        fs.readdirSync(cssDir)
          .filter(file => file.endsWith('.css'))
          .forEach(cssFile => {
            const cssPath = join(cssDir, cssFile);
            let cssContent = fs.readFileSync(cssPath, 'utf-8');

            // Исправляем пути к шрифтам
            cssContent = cssContent.replace(
              /url\(['"]?\/fonts\/([^'")]+)['"]?\)/g,
              'url("../fonts/$1")'
            );

            fs.writeFileSync(cssPath, cssContent);
          });

        console.log(`${CONSOLE_COLORS.green}Пути к шрифтам исправлены${CONSOLE_COLORS.reset}`);
      } catch (error) {
        console.error('Ошибка при исправлении путей к шрифтам:', error);
      }
    }
  };
}

/**
 * Плагин для обработки HTML файлов (удаление лишних атрибутов, замена путей)
 * @returns {Object} Vite плагин
 */
export function processHtmlPlugin() {
  return {
    name: 'process-html',
    apply: 'build',
    closeBundle: async () => {
      try {
        const htmlFiles = fs.readdirSync(PATHS.dist)
          .filter(file => file.endsWith('.html'));

        htmlFiles.forEach(htmlFile => {
          const htmlPath = resolve(PATHS.dist, htmlFile);
          let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

          // Экранируем код в тегах code и pre
          htmlContent = escapeCodeAndPre(htmlContent);

          // Удаление лишних атрибутов и исправление путей
          htmlContent = htmlContent
            .replace(/crossorigin/g, '')
            .replace(/type="module"/g, '')
            .replace(
              /<script[^>]*src="([^"]*\/)?js\/[^"]*\.js[^"]*"[^>]*>(<\/script>)?/g,
              '<script defer src="js/app.js"></script>'
            )
            .replace(
              /<link[^>]*href="([^"]*\/)?css\/[^"]*\.css[^"]*"[^>]*>/g,
              '<link rel="stylesheet" href="css/app.css">'
            )
            .replace(
              /<link[^>]*href="([^"]*\/)?scss\/[^"]*\.scss"[^>]*>/g,
              '<link rel="stylesheet" href="css/app.css">'
            );
            
          // Исправление путей в инлайн стилях с background-image
          const bgImageRegex = /style=["']([^"']*)background-image:\s*url\((['"]?)([^'")]+)(['"]?)\)([^"']*)["']/g;
          htmlContent = htmlContent.replace(bgImageRegex, (match, before, quote1, url, quote2, after) => {
            // Обрабатываем абсолютные пути
            if (url.startsWith('/')) {
              return `style="${before}background-image: url(${quote1}${url.substring(1)}${quote2})${after}"`;
            }
            // Если была ошибка с неправильно сформированным URL
            if (url.includes('=""')) {
              // Исправляем это
              const fixedUrl = url.replace(/\s*([a-zA-Z0-9_-]+)=""\s*([^"]+)/, '$1/$2');
              return `style="${before}background-image: url(${quote1}${fixedUrl}${quote2})${after}"`;
            }
            return match;
          });
          
          // Исправление путей в инлайн стилях с сокращенной записью background: url()
          const bgShortRegex = /style=["']([^"']*)background\s*:\s*url\((['"]?)([^'")]+)(['"]?)\)([^"']*)["']/g;
          htmlContent = htmlContent.replace(bgShortRegex, (match, before, quote1, url, quote2, after) => {
            // Обрабатываем абсолютные пути
            if (url.startsWith('/')) {
              return `style="${before}background: url(${quote1}${url.substring(1)}${quote2})${after}"`;
            }
            // Если была ошибка с неправильно сформированным URL
            if (url.includes('=""')) {
              // Исправляем это
              const fixedUrl = url.replace(/\s*([a-zA-Z0-9_-]+)=""\s*([^"]+)/, '$1/$2');
              return `style="${before}background: url(${quote1}${fixedUrl}${quote2})${after}"`;
            }
            return match;
          });

          // Восстанавливаем экранированный код
          htmlContent = unescapeCodeAndPre(htmlContent);

          fs.writeFileSync(htmlPath, htmlContent);
        });

        // Нормализуем оставшиеся CSS-пути, если они были изменены сборкой
        const cssDir = join(PATHS.dist, 'css');
        if (fs.existsSync(cssDir)) {
          fs.readdirSync(cssDir)
            .filter(file => file.endsWith('.css'))
            .forEach(cssFile => {
              const cssPath = join(cssDir, cssFile);
              let cssContent = fs.readFileSync(cssPath, 'utf-8');
              cssContent = cssContent.replace(/url\(['"]?\.\/([^'" )]+)['"]?\)/g, 'url("$1")');
              fs.writeFileSync(cssPath, cssContent);
            });
        }

        console.log(`${CONSOLE_COLORS.green}Атрибуты HTML исправлены${CONSOLE_COLORS.reset}`);
      } catch (error) {
        console.error('Ошибка при обработке HTML файлов:', error);
      }
    }
  };
}

/**
 * Конвертирует JPG/PNG в WebP и обновляет ссылки в HTML/CSS
 * @returns {Object} Vite плагин
 */
export function convertImagesToWebpPlugin() {
  return {
    name: 'convert-images-to-webp',
    apply: 'build',
    closeBundle: async () => {
      try {
        const convertInDir = async (dir) => {
          if (!fs.existsSync(dir)) return;

          const entries = fs.readdirSync(dir, { withFileTypes: true });
          await Promise.all(entries.map(async (entry) => {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
              await convertInDir(fullPath);
              return;
            }

            if (!/\.(jpe?g|png)$/i.test(entry.name)) return;

            const targetPath = fullPath.replace(/\.(jpe?g|png)$/i, '.webp');
            if (fs.existsSync(targetPath)) {
              fs.unlinkSync(fullPath);
              return;
            }

            await sharp(fullPath).webp({ quality: 80 }).toFile(targetPath);
            fs.unlinkSync(fullPath);
          }));
        };

        await convertInDir(join(PATHS.dist, 'img'));

        const replaceExtInFiles = (dir) => {
          if (!fs.existsSync(dir)) return;

          fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
              replaceExtInFiles(fullPath);
              return;
            }

            if (!/\.(html|css)$/i.test(entry.name)) return;

            const content = fs.readFileSync(fullPath, 'utf-8');
            const updated = content.replace(/\.(jpe?g|png)/gi, '.webp');
            if (updated !== content) {
              fs.writeFileSync(fullPath, updated);
            }
          });
        };

        replaceExtInFiles(PATHS.dist);

        console.log(`${CONSOLE_COLORS.green}Изображения конвертированы в WebP и ссылки обновлены${CONSOLE_COLORS.reset}`);
      } catch (error) {
        console.error('Ошибка при конвертации изображений в WebP:', error);
      }
    }
  };
}

/**
 * Плагин для исправления относительных путей
 * @returns {Object} Vite плагин
 */
export function fixAssetsPathsPlugin() {
  return {
    name: 'fix-assets-paths',
    closeBundle: async () => {
      try {
        fs.readdirSync(PATHS.dist)
          .filter(file => file.endsWith('.html'))
          .forEach(htmlFile => {
            const htmlPath = resolve(PATHS.dist, htmlFile);
            let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

            // Экранируем код в тегах code и pre
            htmlContent = escapeCodeAndPre(htmlContent);

            // Удаляем ./ из всех путей для src, href и srcset
            htmlContent = htmlContent.replace(
              /(src|href|srcset)=(['"])\.\/([^"']+)(['"])/g,
              '$1="$3"'
            );

            // Восстанавливаем экранированный код
            htmlContent = unescapeCodeAndPre(htmlContent);

            fs.writeFileSync(htmlPath, htmlContent);
          });

        console.log(`${CONSOLE_COLORS.green}Пути к ресурсам исправлены (удалены префиксы ./)${CONSOLE_COLORS.reset}`);
      } catch (error) {
        console.error('Ошибка при исправлении путей к ресурсам:', error);
      }
    }
  };
}

/**
 * Плагин для переименования JS файлов
 * @returns {Object} Vite плагин
 */
export function renameJsPlugin() {
  return {
    name: 'rename-js-plugin',
    apply: 'build',
    closeBundle: async () => {
      try {
        const jsDir = join(PATHS.dist, 'js');
        if (!fs.existsSync(jsDir)) {
          fs.mkdirSync(jsDir, { recursive: true });
          return;
        }

        fs.readdirSync(jsDir)
          .filter(file => file.startsWith('app') && file.endsWith('.js') && file !== 'app.js')
          .forEach(file => {
            const filePath = join(jsDir, file);
            const newFilePath = join(jsDir, 'app.js');

            if (fs.existsSync(newFilePath)) {
              fs.unlinkSync(newFilePath);
            }

            fs.renameSync(filePath, newFilePath);
          });
      } catch (error) {
        console.error('Ошибка при переименовании JS файла:', error);
      }
    }
  };
} 