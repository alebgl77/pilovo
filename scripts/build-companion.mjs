import { build } from 'esbuild';
await build({ entryPoints: ['companion/claude-code.ts', 'companion/codex.ts', 'companion/native-host.ts'], outdir: 'companion-dist', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', sourcemap: false });
