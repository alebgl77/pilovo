import { loadHostConfig, validateOrigin } from './config';
import { NativeHost } from './host';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 3 || args[0] !== '--config' || args.length > 4 || (args[3] !== undefined && !/^--parent-window=\d+$/.test(args[3]))) throw new Error('invalid_arguments');
  const config = await loadHostConfig(args[1]);
  validateOrigin(args[2], config.extensionId);
  const host = new NativeHost(config, process.stdin, process.stdout);
  process.once('SIGINT', () => { void host.close(); }); process.once('SIGTERM', () => { void host.close(); });
  await host.start();
}
void main().catch(() => { process.stderr.write('hub: native_start_failed\n'); process.exitCode = 1; process.stdin.destroy(); });
