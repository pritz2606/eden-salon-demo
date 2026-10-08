import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(root, ".env"))) loadEnvFile(path.join(root, ".env"));
const binary = (name) => path.join(root, "node_modules", name);
const processes = [];
let stopping = false;

function launch(label, script, args = [], env = {}) {
  const child = spawn(process.execPath, [script, ...args], { cwd: root, env: { ...process.env, ...env }, stdio: ["inherit", "pipe", "pipe", "ipc"] });
  processes.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => process.stdout.write(`[${label}] ${data}`));
  child.on("exit", (code) => { if (!stopping && code !== 0) { console.error(`${label} stopped. Close and restart the demo after resolving its error.`); stop(code || 1); } });
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (child.exitCode === null && child.spawnargs.some((arg) => arg.endsWith("firestore.mjs"))) child.send("shutdown");
    else if (child.exitCode === null) child.kill("SIGINT");
  }
  setTimeout(() => process.exit(code), 18000).unref();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

const compile = launch("api build", binary("typescript/bin/tsc"), ["-p", "api/tsconfig.json"]);
await new Promise((resolve, reject) => compile.on("exit", (code) => code === 0 ? resolve() : reject(new Error("The API did not compile."))));
launch("firestore", path.join(root, "scripts/firestore.mjs"));
let ready = false;
for (let attempt = 0; attempt < 90; attempt++) {
  try {
    await fetch("http://127.0.0.1:8085", { signal: AbortSignal.timeout(700) });
    ready = true;
    break;
  } catch { await new Promise((resolve) => setTimeout(resolve, 1000)); }
}
if (!ready) { console.error("Firestore could not start. Java 21+ is required. Check emulator output."); stop(1); }
else {
  launch("nest", path.join(root, "api/dist/main.js"), [], { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085", FIREBASE_PROJECT_ID: "demo-eden-salon", WEB_ORIGIN: "http://127.0.0.1:3100,http://localhost:3100" });
  launch("next", binary("next/dist/bin/next"), ["dev", "web", "--port", "3100", "--hostname", "127.0.0.1"]);
  console.log("Eden portfolio demo: http://127.0.0.1:3100");
}
