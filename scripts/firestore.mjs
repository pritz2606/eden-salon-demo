import { spawn } from "node:child_process";
import { existsSync, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Official artifact and checksum from Firebase CLI 15.33's downloadableEmulatorInfo.json.
const version = "1.22.0";
const checksum = "9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c";
const jar = path.join(root, ".runtime", `cloud-firestore-emulator-v${version}.jar`);
const pointer = path.join(root, ".emulator-data", "latest.json");
let saving;

export async function exportSnapshot() {
  if (saving) return saving;
  saving = (async () => {
    const directory = path.join(root, ".emulator-data", `snapshot-${Date.now()}`);
    await mkdir(directory, { recursive: true });
    const response = await fetch("http://127.0.0.1:8085/emulator/v1/projects/demo-eden-salon:export", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ database: "projects/demo-eden-salon/databases/(default)", export_directory: directory, export_name: "firestore_export" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Could not save the local Firestore snapshot.");
    const metadata = path.join(directory, "firestore_export", "firestore_export.overall_export_metadata");
    if (!existsSync(metadata)) throw new Error("The database snapshot did not produce its import metadata.");
    await writeFile(`${pointer}.tmp`, JSON.stringify({ metadata }), "utf8");
    await rename(`${pointer}.tmp`, pointer);
    return metadata;
  })().finally(() => { saving = undefined; });
  return saving;
}

async function ensureJar() {
  await mkdir(path.dirname(jar), { recursive: true });
  if (!existsSync(jar)) {
    console.log("Downloading the official Firestore emulator once (about 137 MB).");
    const response = await fetch(`https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v${version}.jar`, { signal: AbortSignal.timeout(180000) });
    if (!response.ok || !response.body) throw new Error("Could not download the official Firestore emulator.");
    await pipeline(Readable.fromWeb(response.body), createWriteStream(`${jar}.download`));
    await rename(`${jar}.download`, jar);
  }
  const actual = createHash("sha256").update(await readFile(jar)).digest("hex");
  if (actual !== checksum) throw new Error("Firestore emulator checksum mismatch. Remove the local jar and retry.");
}

async function start() {
  await ensureJar();
  const args = ["-Duser.language=en", "-jar", jar, "--host", "127.0.0.1", "--port", "8085", "--project_id", "demo-eden-salon", "--rules", path.join(root, "firestore.rules")];
  if (existsSync(pointer)) {
    const previous = JSON.parse(await readFile(pointer, "utf8"));
    const resolved = path.resolve(previous.metadata);
    const exportRoot = path.resolve(root, ".emulator-data") + path.sep;
    if (resolved.startsWith(exportRoot) && existsSync(resolved)) args.push("--seed_from_export", resolved);
  }
  const child = spawn("java", args, { cwd: root, stdio: "inherit" });
  child.on("error", () => { console.error("Java 21 or newer is required to run the Firestore emulator."); process.exitCode = 1; });
  let stopping = false;
  const timer = setInterval(() => exportSnapshot().catch(() => {}), 60000);
  child.on("exit", (code) => { clearInterval(timer); if (!stopping) process.exit(code || 0); });
  async function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    try { await exportSnapshot(); console.log("Local demo database saved."); } catch { console.log("Database save unavailable; the previous snapshot is preserved."); }
    child.kill();
    process.exit(0);
  }
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("message", (message) => { if (message === "shutdown") void stop(); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) start().catch((error) => { console.error(error.message); process.exitCode = 1; });
