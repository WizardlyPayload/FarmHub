// Wake this FarmHub chat for a substantive vault result, or the specific RF
// release currently gating the next FarmHub packet.
// Local file events and a filesystem-only fallback; no idle model calls.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parseSubstantiveReturns } from './farmhub-ally-events.mjs';

const threadId = process.env.CODEX_THREAD_ID;
if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(threadId ?? '')) {
  throw Error('CODEX_THREAD_ID_REQUIRED');
}
const inbox = 'Z:\\Graham\\agent-comms\\to-wizard-pc.md';
const dir = path.join(os.homedir(), '.codex', 'watchers', 'farmhub-ally');
const statePath = path.join(dir, 'state.json');
const stopPath = path.join(dir, 'STOP');
const adapterPath = 'C:\\Users\\Graham\\Documents\\Realistic-Farming\\tools\\motherbarn-brian\\codex-app.mjs';
const refreshPath = 'C:\\Users\\Graham\\Documents\\Realistic-Farming\\tools\\pipeline-notify\\start-brian-cover-from-app.ps1';
const execFileAsync = promisify(execFile);
fs.mkdirSync(dir, { recursive: true });

function readState() {
  if (!fs.existsSync(statePath)) return null;
  const value = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (value.threadId !== threadId || !Array.isArray(value.events)) throw Error('WATCH_STATE_MISMATCH');
  return value;
}
function writeState(state) {
  const temp = statePath + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, statePath);
}
const results = parseSubstantiveReturns;
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
if (process.argv.includes('--status')) {
  const state = readState();
  console.log(JSON.stringify(state ? {
    running: alive(state.pid), pid: state.pid, threadMatches: state.threadId === threadId,
    baselineCount: state.baselineCount, events: state.events.map(({ id, kind, status }) => ({ id, kind, status })),
    watchMode: state.watchMode, lastScan: state.lastScan, lastWake: state.lastWake, lastError: state.lastError,
  } : { running: false, state: 'missing' }, null, 2));
  process.exit(0);
}
if (!process.env.CODEX_APP_TOOLS_PIPE_PATH) throw Error('CODEX_APP_PIPE_REQUIRED');
const prior = readState();
if (prior && alive(prior.pid)) throw Error('WATCH_ALREADY_RUNNING');
const adapter = await import(pathToFileURL(adapterPath).href);
if (adapter.BRIAN_THREAD_ID !== threadId) throw Error('ADAPTER_THREAD_MISMATCH');
const initial = results(fs.readFileSync(inbox, 'utf8'));
// These returns were reviewed before the Storage ID matcher was added. Keep
// them out of the first post-upgrade wake; still queue any later result that
// arrived while the watcher was stopped.
const reviewedIds = new Set([
  'FARMHUB-ALLY-20261031-VAULT-V1',
  'RF-20261102-TINA-LOCAL-LOAD-1479',
  ...[1, 2, 3, 4, 5].map(n => `FARMHUB-ALLY-20261102-STORAGE-ICONS-I${n}`),
]);
const reviewed = initial.filter(event => reviewedIds.has(event.id));
const state = prior ?? {
  threadId, seen: reviewed.map(event => event.hash), baselineCount: reviewed.length, events: [],
};
state.seen = [...new Set([...state.seen, ...reviewed.map(event => event.hash)])];
state.pid = process.pid;
state.lastError = null;
const seen = new Set(state.seen);
for (const event of state.events) if (event.status === 'inflight') event.status = 'uncertain';
writeState(state);

let busy = false, stopped = false, debounce;
async function refreshPipe() {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', refreshPath, '-EmitPipeForWatcher',
  ], { windowsHide: true, timeout: 20000, maxBuffer: 8192 });
  const pipe = stdout.trim();
  if (!pipe || /[\r\n]/.test(pipe)) throw Error('PIPE_REFRESH_INVALID');
  process.env.CODEX_APP_TOOLS_PIPE_PATH = pipe;
}
async function readTask() {
  try { return await adapter.readBrianTask({ timeoutMs: 10000, turnLimit: 1 }); }
  catch (error) {
    if (error.code !== 'BRIAN_MCP_TIMEOUT') throw error;
    await refreshPipe();
    return adapter.readBrianTask({ timeoutMs: 10000, turnLimit: 1 });
  }
}
async function deliver() {
  if (busy || stopped) return;
  const queued = state.events.filter(event => event.status === 'queued');
  if (!queued.length) return;
  busy = true;
  try {
    const task = await readTask();
    const current = task.turns?.[0]?.status;
    if (['active', 'inProgress', 'waitingForInput'].includes(current) ||
        ['active', 'inProgress', 'waitingForInput'].includes(task.status)) return;
    for (const event of queued) event.status = 'inflight';
    writeState(state);
    const labels = queued.map(event => `${event.kind} ${event.id}`).join(', ');
    const prompt = `FarmHub file watcher detected substantive return: ${labels}. ` +
      'Read Z:\\Graham\\agent-comms\\to-wizard-pc.md and the exact evidence. ' +
      'Check the latest RF ownership and full Ally restoration before any FarmHub request. ' +
      'Review pending frozen/draft packets and append-only to-tina.md before sending a request; never duplicate an existing ID. ' +
      'Independently verify hashes, game/export/installed values, generations, log, one Windows row and restoration. ' +
      'Continue meaningful vault source work when RF owns Ally; keep Graham PC UI free. ' +
      'The five-minute automation remains paused. Notify Graham only for a meaningful blocker or completed scoped acceptance.';
    const result = await adapter.sendBrianWake({ prompt, timeoutMs: 60000 });
    if (!result.delivered || result.threadId !== threadId) throw Error('WAKE_UNCONFIRMED');
    for (const event of queued) event.status = 'delivered';
    state.lastWake = new Date().toISOString();
    state.lastError = null;
  } catch (error) {
    const uncertain = error.uncertain === true || queued.some(event => event.status === 'inflight');
    for (const event of queued) event.status = uncertain ? 'uncertain' : 'queued';
    state.lastError = { at: new Date().toISOString(), code: error.code || error.message || 'WAKE_FAILED' };
  } finally {
    writeState(state);
    busy = false;
  }
}
function scan() {
  if (stopped) return;
  try {
    for (const event of results(fs.readFileSync(inbox, 'utf8'))) {
      if (seen.has(event.hash)) continue;
      seen.add(event.hash);
      state.events.push({ ...event, status: 'queued', at: new Date().toISOString() });
    }
    state.seen = [...seen];
    state.lastScan = new Date().toISOString();
    writeState(state);
    void deliver();
  } catch (error) {
    state.lastError = { at: new Date().toISOString(), code: error.code || 'SCAN_FAILED' };
    writeState(state);
  }
}
function schedule() { clearTimeout(debounce); debounce = setTimeout(scan, 700); }
let watcher;
try {
  watcher = fs.watch(path.dirname(inbox), (_, name) => {
    if (!name || String(name).toLowerCase() === 'to-wizard-pc.md') schedule();
  });
  state.watchMode = 'event-plus-30s-fallback';
  writeState(state);
} catch {
  state.watchMode = '30s-file-check';
  writeState(state);
}
watcher?.on('error', () => {
  watcher.close();
  watcher = null;
  state.watchMode = '30s-file-check';
  writeState(state);
});
const fallback = setInterval(scan, 30000); // filesystem check only; no idle model request
const stopCheck = setInterval(() => { if (fs.existsSync(stopPath)) { fs.unlinkSync(stopPath); stop(); } }, 1000);
function stop() {
  if (stopped) return;
  stopped = true;
  clearTimeout(debounce); clearInterval(fallback); clearInterval(stopCheck); watcher?.close();
  state.pid = null; writeState(state);
  process.exit(0);
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
scan();
