// Explicit release acceptance driver. This is never included in npm test or the shipped companion.
// It invokes real authenticated CLIs with a synthetic task, bounded runtime and no global config edits.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const installIndex = process.argv.indexOf('--install-dir');
if (installIndex < 0 || !process.argv[installIndex + 1]) throw new Error('Use --install-dir ABSOLUTE_PREPARED_INSTALLATION');
const install = path.resolve(process.argv[installIndex + 1]);
const sourceIndex = process.argv.indexOf('--source');
const selectedSources = sourceIndex >= 0 ? [process.argv[sourceIndex + 1]] : ['claude-code', 'codex'];
if (selectedSources.some(source => !['claude-code', 'codex'].includes(source))) throw new Error('invalid_source');
const repo = path.resolve(import.meta.dirname, '../../..');
const run = path.join(repo, 'work', 'live-acceptance', randomUUID());
await fs.mkdir(run, { recursive: true, mode: 0o700 });
const executables = {
  'claude-code': process.env.CLAUDE_PATH || 'claude',
  codex: process.env.CODEX_PATH || 'codex',
};
const runId = path.basename(run);
const titleFor = source => `Live CLI acceptance ${source} ${runId}`;
const promptFor = source => `This is a bounded integration acceptance test. If the hub tools are deferred, you may use the built-in tool discovery/search to find them. Perform exactly two hub tool calls. First call hub_start_task with title ${JSON.stringify(titleFor(source))} and contextUrl "https://example.com". Read taskHandle from that result. Then call hub_complete_task with that taskHandle and summary "MCP start and completion calls executed; no independent verification is claimed." Do not read files, run commands, browse, delegate, create other tasks, or claim the hub received the events. Omit the model field. Report the two tool results only. If the tools remain unavailable after discovery, report that and stop.`;
const claudeMcp = path.join(run, 'claude-mcp.json');
await fs.writeFile(claudeMcp, JSON.stringify({ mcpServers: { hub: { command: process.execPath, args: [path.join(install, 'claude-code.cjs'), '--config', path.join(install, 'claude-code-config.json')] } } }), { mode: 0o600 });
const versions = Object.fromEntries(Object.entries(executables).map(([source, exe]) => {
  const result = spawnSync(exe, ['--version'], { cwd: run, encoding: 'utf8', windowsHide: true });
  return [source, result.status === 0 ? result.stdout.trim().slice(0, 100) : 'unavailable'];
}));
function classifyFailure(text) {
  const patterns = [
    ['authentication_required', /not logged in|not authenticated|authentication (?:failed|required)|login required|unauthorized|invalid api key|credentials (?:missing|not found)/i],
    ['network_unavailable', /connection (?:refused|reset)|network (?:error|unreachable)|fetch failed|ENOTFOUND|ECONN|unable to resolve/i],
    ['permission_denied', /permission denied|access is denied|accès refusé|operation not permitted/i],
    ['provider_limit', /rate limit|quota|usage limit|credit balance|exceeded.*limit/i],
    ['mcp_start_failed', /MCP.*(?:failed|error)|hub.*(?:failed|error)/i],
  ];
  return patterns.find(([, regex]) => regex.test(text))?.[0] ?? 'cli_failed_or_no_events';
}
function summarizeCliOutput(source, output) {
  const messages = [], toolCalls = [];
  for (const line of output.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (source === 'claude-code' && typeof event.result === 'string') messages.push(event.result);
      if (event.item?.type === 'agent_message' && typeof event.item.text === 'string') messages.push(event.item.text);
      if (event.item?.type === 'mcp_tool_call') toolCalls.push({ server: event.item.server, tool: event.item.tool, status: event.item.status });
    } catch { /* Never retain unstructured CLI diagnostics or profile logs. */ }
  }
  const last = messages.at(-1);
  return { toolCalls, reportedToolUnavailable: !!last && /unavailable|not available|cannot|can't|no (?:access|mcp|tools)/i.test(last), finalMessage: last?.slice(0, 1500) };
}
async function execute(source) {
  const prompt = promptFor(source);
  const args = source === 'claude-code'
    ? ['-p', prompt, '--mcp-config', claudeMcp, '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence', '--output-format', 'json', '--tools', '', '--allowedTools', 'mcp__hub__hub_start_task,mcp__hub__hub_complete_task', '--disable-slash-commands', '--no-chrome']
    : ['exec', '--json', '--ephemeral', '--ignore-user-config', '--strict-config', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', run, '-c', `mcp_servers.hub.command=${JSON.stringify(process.execPath)}`, '-c', `mcp_servers.hub.args=${JSON.stringify([path.join(install, 'codex.cjs'), '--config', path.join(install, 'codex-config.json')])}`, '-c', 'mcp_servers.hub.required=true', '-c', 'mcp_servers.hub.enabled=true', '-c', 'mcp_servers.hub.startup_timeout_sec=30', '-c', 'mcp_optional_startup_grace_ms=0', prompt];
  const startedAt = new Date().toISOString();
  const child = spawn(executables[source], args, { cwd: run, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', diagnostic = '', timedOut = false;
  child.stdout.on('data', chunk => { if (output.length < 1024 * 1024) output += chunk.toString(); });
  child.stderr.on('data', chunk => { if (diagnostic.length < 128 * 1024) diagnostic += chunk.toString(); });
  const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 120000);
  const exitCode = await new Promise(resolve => { child.once('error', () => resolve(-1)); child.once('exit', code => resolve(code)); });
  clearTimeout(timeout);
  const config = JSON.parse(await fs.readFile(path.join(install, `${source}-config.json`), 'utf8'));
  const outbox = path.join(config.dataDirectory, source, 'outbox');
  let events = [];
  try {
    for (const name of await fs.readdir(outbox)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      const envelope = JSON.parse(await fs.readFile(path.join(outbox, name), 'utf8'));
      const expected = createHmac('sha256', Buffer.from(config.secret, 'hex')).update(`hub-envelope-v1:${envelope.body}`).digest();
      const actual = Buffer.from(envelope.signature, 'hex');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('invalid_source_signature');
      const event = JSON.parse(Buffer.from(envelope.body, 'base64').toString('utf8'));
      if (event.sourceId !== source) throw new Error('source_mismatch');
      events.push(event);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const start = events.find(event => event.type === 'task.started' && event.payload.title === titleFor(source));
  const complete = start && events.find(event => event.type === 'task.completed' && event.taskId === start.taskId && event.runId === start.runId && event.sequence === start.sequence + 1);
  // If Chrome already consumed the events, preserve the durable run identity for browser-side proof.
  let stateIds = [];
  const statesDirectory = path.join(config.dataDirectory, source, 'states');
  try {
    for (const name of await fs.readdir(statesDirectory)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      const envelope = JSON.parse(await fs.readFile(path.join(statesDirectory, name), 'utf8'));
      const state = JSON.parse(Buffer.from(envelope.body, 'base64').toString('utf8'));
      if (state.updatedAt >= startedAt) stateIds.push({ taskId: state.taskId, runId: state.runId, sequence: state.sequence, ended: state.ended });
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const success = Boolean(start && complete);
  const safeDiagnostics = diagnostic.replaceAll(config.secret, '[REDACTED]').replaceAll(install, '[INSTALL]').replaceAll(run, '[WORKSPACE]').replaceAll(process.env.USERPROFILE ?? '__NO_PROFILE__', '[USER]').replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/).filter(line => /mcp|hub|error|warn/i.test(line)).slice(0, 20).map(line => line.slice(0, 400));
  const result = { source, cliVersion: versions[source], startedAt, endedAt: new Date().toISOString(), exitCode, timedOut, outcome: success ? 'signed_start_and_completion_observed' : timedOut ? 'timeout' : classifyFailure(output + diagnostic), ...summarizeCliOutput(source, output), safeDiagnostics, title: titleFor(source), taskId: start?.taskId, runId: start?.runId, eventIds: start && complete ? [start.eventId, complete.eventId] : [], durableRunStates: stateIds, modelOverride: false, rawLogsRetained: false, globalConfigurationModified: false };
  process.stdout.write(JSON.stringify(result) + '\n');
  return result;
}
const results = await Promise.all(selectedSources.map(execute));
const evidence = { schemaVersion: 1, runId, installation: install, results };
await fs.writeFile(path.join(run, 'evidence.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 });
process.stdout.write(`Evidence: ${path.join(run, 'evidence.json')}\n`);
if (results.some(result => result.outcome !== 'signed_start_and_completion_observed')) process.exitCode = 1;
