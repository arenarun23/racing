// 미리보기용 단일 HTML 만들기 (배포에는 쓰지 않음): npm i && npm run preview
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const out = await build({
  entryPoints: [path.join(root, 'js/main.js')],
  bundle: true, format: 'esm', minify: true, write: false,
});
const js = out.outputFiles[0].text.replaceAll('</script', '<\\/script');
const css = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace(/<script type="importmap">.*?<\/script>\n?/s, '')
  .replace('<link rel="stylesheet" href="./css/app.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="./js/main.js"></script>', () => `<script type="module">${js}</script>`);
fs.mkdirSync(path.join(root, 'preview'), { recursive: true });
fs.writeFileSync(path.join(root, 'preview/index.html'), html);
console.log('preview/index.html', (html.length / 1024).toFixed(0) + 'KB');
