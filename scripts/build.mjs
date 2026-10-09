import { build } from 'esbuild';
await build({ entryPoints: ['src/background/index.ts'], outfile: 'dist/background.js', bundle: true, platform: 'browser', format: 'esm', target: 'chrome120', minify: true, sourcemap: false });
