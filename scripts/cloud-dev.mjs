import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(path.join(root, '.env.cloud'));
if (process.env.FIREBASE_MODE !== 'cloud' || process.env.EDEN_LOCAL_PREVIEW !== 'true') {
  throw new Error('This runner requires explicit loopback cloud preview settings in .env.cloud.');
}
if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Remove FIRESTORE_EMULATOR_HOST before starting cloud preview.');
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGINT');
  process.exitCode = code;
}
function launch(label, file, args = []) {
  const child = spawn(process.execPath, [file, ...args], { cwd: root, env: process.env, stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => process.stdout.write(`[${label}] ${data}`));
  child.on('error', () => { console.error(`${label} could not start.`); stop(1); });
  child.on('exit', code => { if (!stopping && code !== 0) stop(code || 1); });
  return child;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
const compile = launch('api build', path.join(root, 'node_modules/typescript/bin/tsc'), ['-p', 'api/tsconfig.json']);
await new Promise((resolve, reject) => compile.on('exit', code => code === 0 ? resolve() : reject(new Error('The API did not compile.'))));
launch('cloud api', path.join(root, 'api/dist/main.js'));
let ready = false;
for (let attempt = 0; attempt < 45; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.API_PORT || 4100}/api/health`, { signal: AbortSignal.timeout(2000) });
    const health = await response.json();
    if (response.ok && health.database === 'cloud-firestore') { ready = true; break; }
  } catch {}
  if (stopping) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!ready) { console.error('Cloud Firestore did not become ready. Check Google authorization and project settings.'); stop(1); }
else {
  launch('next', path.join(root, 'node_modules/next/dist/bin/next'), ['dev', 'web', '--port', '3100', '--hostname', '127.0.0.1']);
  console.info('Eden Salon demo is using your Cloud Firestore database at http://127.0.0.1:3100.');
}
