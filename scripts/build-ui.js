import { build } from 'esbuild';
import { mkdir, copyFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const distDir = join(projectRoot, 'dist');

await mkdir(distDir, { recursive: true });

await build({
  entryPoints: [join(projectRoot, 'src/ui/index.jsx')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  sourcemap: true,
  target: ['chrome118'],
  loader: {
    '.jsx': 'jsx'
  },
  outfile: join(distDir, 'renderer.js'),
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development')
  }
});

await copyFile(join(projectRoot, 'src/ui/index.html'), join(distDir, 'index.html'));
