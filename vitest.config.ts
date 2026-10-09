import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/core/**/*.test.ts', 'tests/ui/**/*.test.ts'], environment: 'node', pool: 'threads', fileParallelism: false } });
