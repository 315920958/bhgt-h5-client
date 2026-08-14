import { createWriteStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ZipArchive } = require('archiver');

const projectRoot = resolve(import.meta.dirname, '..');
const distDir = resolve(projectRoot, 'dist');
const outputFile = resolve(projectRoot, 'bhgt-h5-client.zip');

await readdir(distDir);
await new Promise((resolvePromise, reject) => {
  const output = createWriteStream(outputFile);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  output.on('close', resolvePromise);
  output.on('error', reject);
  archive.on('error', reject);
  archive.pipe(output);
  // 上传平台要求解压后的第一层是 dist/，而不是把 dist 内文件平铺到根目录。
  archive.directory(distDir, 'dist');
  archive.finalize();
});

console.info(`[BHGT][Build] upload package created: ${outputFile}`);
