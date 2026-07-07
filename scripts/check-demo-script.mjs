import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const candidates = [join(process.cwd(), 'index.html'), join(process.cwd(), 'demo', 'index.html')];
const htmlPath = candidates.find((path) => existsSync(path));

if (!htmlPath) {
  console.error('index.html 또는 demo/index.html을 찾지 못했습니다.');
  process.exit(1);
}

const html = readFileSync(htmlPath, 'utf8');
const start = html.indexOf('<script>');
const end = html.lastIndexOf('</script>');

if (start < 0 || end < 0 || end <= start) {
  console.error(`${htmlPath} inline script block을 찾지 못했습니다.`);
  process.exit(1);
}

mkdirSync(join(process.cwd(), 'test-results'), { recursive: true });
const script = html.slice(start + '<script>'.length, end);
const outPath = join(process.cwd(), 'test-results', 'demo-inline-script.js');
writeFileSync(outPath, script);

const result = spawnSync(process.execPath, ['--check', outPath], { stdio: 'inherit' });
process.exit(result.status ?? 1);
