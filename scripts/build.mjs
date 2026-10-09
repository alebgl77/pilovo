import { build } from 'esbuild';
await build({ entryPoints: ['src/background/index.ts'], outfile: 'dist/background.js', bundle: true, platform: 'browser', format: 'esm', target: 'chrome120', minify: true, sourcemap: false });
await build({ entryPoints: ['src/content/observer.ts'], outfile: 'dist/observer.js', bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', minify: true, sourcemap: false });
