import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Google's official CLI performs OAuth and stores ADC in a private, ignored
// directory. A one-use code can be handed over locally without printing it.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdk = path.join(root, '.runtime', 'google-cloud-sdk');
const python = path.join(sdk, 'platform', 'bundledpython', 'python.exe');
const authDirectory = path.join(root, '.runtime', 'google-cloud-auth');
const handoffFile = path.join(authDirectory, 'one-time-code.txt');
if (!existsSync(python)) throw new Error('Install the official bundled Google Cloud CLI under .runtime/google-cloud-sdk first. See README.');
await mkdir(authDirectory, { recursive: true });
await unlink(handoffFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
const child = spawn(python, [path.join(sdk, 'lib', 'gcloud.py'), 'auth', 'application-default', 'login', '--no-launch-browser', '--scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform', '--disable-quota-project'], {
  cwd: root,
  env: { ...process.env, CLOUDSDK_CONFIG: authDirectory, PYTHONUNBUFFERED: '1' },
  stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
});
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => process.stdout.write(data));
let receiving = false;
const timer = setInterval(async () => {
  if (receiving) return;
  try {
    const code = (await readFile(handoffFile, 'utf8')).trim();
    if (!/^[A-Za-z0-9_./-]{20,2000}$/.test(code)) throw new Error('The one-use Google sign-in code has an invalid format.');
    receiving = true;
    await unlink(handoffFile);
    child.stdin.end(`${code}\n`);
    clearInterval(timer);
  } catch (error) {
    if (error.code !== 'ENOENT') { console.error('Google sign-in handoff could not be read.'); child.kill(); clearInterval(timer); }
  }
}, 500);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(timer); child.kill(); });
child.on('error', () => { clearInterval(timer); console.error('Google Cloud CLI could not start.'); process.exitCode = 1; });
child.on('exit', async code => { clearInterval(timer); await unlink(handoffFile).catch(() => {}); process.exitCode = code || 0; });
