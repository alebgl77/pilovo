import { runAdapter } from './adapter';
void runAdapter('codex').catch(() => { process.stderr.write('hub: adapter_start_failed\n'); process.exitCode = 1; process.stdin.destroy(); });
