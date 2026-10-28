// Cargo's windows-gnu target supplies MinGW CRT flags. Zig already links its
// own compatible CRT; remove only those duplicate library requests.
const { spawnSync } = require('node:child_process');

const zig = process.env.FARMDASH_ZIG_EXE;
if (!zig) {
  process.stderr.write('FARMDASH_ZIG_EXE is required\n');
  process.exit(2);
}
const omit = new Set([
  '-nodefaultlibs', '-lmsvcrt', '-lmingwex', '-lmingw32',
  '-lgcc', '-l:libpthread.a',
]);
const args = process.argv.slice(2).filter((arg) => !omit.has(arg));
const result = spawnSync(zig, ['cc', '-target', 'x86_64-windows-gnu', ...args], {
  stdio: 'inherit',
  windowsHide: true,
});
process.exit(result.status ?? 1);
