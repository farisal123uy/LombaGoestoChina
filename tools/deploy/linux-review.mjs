import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { loadModelOptions } from "../models/cloud-config.mjs";
import { StructuredModelClient, cloudModelProfiles } from "@guardian-wallet/planner";
import { mergeEnvironment } from "../services/config.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url)), directory = join(root, ".local/linux-review");
const claimedFree = process.argv.includes("--claimed-free");
const connection = JSON.parse(await readFile(join(directory, "connection.private.json"), "utf8"));
if (!connection.connected) throw new Error("FREE_LINUX_VM_NOT_CONNECTED");
const origin = new URL(connection.previewUrl).origin;
if (!/^https:\/\/preview-[a-z0-9]+\.up\.railway\.app$/.test(origin)) throw new Error("UNEXPECTED_REVIEW_ORIGIN");
const options = ["-4", "-T", "-i", join(directory, "id_ed25519"), "-o", "IdentitiesOnly=yes", "-o", "ForwardAgent=no", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", `UserKnownHostsFile=${join(directory, "known_hosts")}`, "-o", "ConnectTimeout=20", "railway.new"];
const quote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
async function remote(stage, code, input, timeout = 120000) {
  const result = spawnSync("ssh", [...options, `node -e ${quote(code)}`], { input, encoding: "utf8", timeout, maxBuffer: 12 * 1024 * 1024, windowsHide: true });
  await writeFile(join(directory, `${stage}.stdout.private.log`), result.stdout || "", { mode: 0o600 });
  await writeFile(join(directory, `${stage}.stderr.private.log`), result.stderr || "", { mode: 0o600 });
  let pending; try { pending = JSON.parse(result.stdout || "null"); } catch { /* Raw SSH output stays private. */ }
  if (pending?.status === "claim_required") {
    const url = new URL(pending.human_claim_url);
    if (url.hostname === "railway.com" || url.hostname.endsWith(".railway.com")) await writeFile(join(directory, "claim-link.private.txt"), `${url.toString()}\n`, { mode: 0o600 });
    throw new Error("HUMAN_FREE_ACCOUNT_CLAIM_REQUIRED");
  }
  if (result.status !== 0) throw new Error(`LINUX_${stage.toUpperCase().replaceAll("-", "_")}_FAILED`);
  console.log(JSON.stringify({ stage, status: "passed" }));
  return result.stdout || "";
}

// Validate source/model configuration before touching the running service.
const source = await readFile(join(root, ".local/release/Guardian-Wallet-source-review.zip"));
const buildId = createHash("sha256").update(source).digest("hex");
const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true });
if (revision.status !== 0 || !/^[a-f0-9]{40}$/.test(revision.stdout.trim())) throw new Error("SOURCE_REVISION_UNAVAILABLE");
const sourceRevision = revision.stdout.trim();
const model = await loadModelOptions(); new StructuredModelClient(model);
let access;
try { access = JSON.parse(await readFile(join(directory, "access.private.json"), "utf8")); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  access = { accessCode: randomBytes(32).toString("hex") };
  await writeFile(join(directory, "access.private.json"), `${JSON.stringify(access)}\n`, { mode: 0o600 });
}
if (typeof access.accessCode !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(access.accessCode)) throw new Error("INVALID_SAVED_REVIEW_ACCESS_CODE");
const variables = { AI_PROVIDER: "groq", AI_MODEL_ID: model.modelId, GROQ_API_KEY: model.apiKey, GROQ_FREE_TIER_CONFIRMED: "true", REVIEW_ACCESS_CODE: access.accessCode,
  AI_REQUEST_TIMEOUT_MS: "30000", AI_CONTEXT_TOKENS: "4096", AI_OUTPUT_TOKENS: String(cloudModelProfiles[model.modelId].defaultCompletionTokens),
  REVIEW_MAX_SESSIONS: "1", REVIEW_BUILD_ID: buildId, PORT: "8080", KERNEL_FORK_RPC_URL: "https://sepolia.base.org", NODE_ENV: "production" };
const cleanModelEnv = `const env={...process.env};for(const key of ${JSON.stringify(Object.keys(variables))})delete env[key];`;
const base = "/tmp/guardian-review", appAlias = `${base}/guardian-wallet`, release = `${base}/releases/${buildId}`, app = `${release}/guardian-wallet`;
const privateDir = "/tmp/guardian-review-private", envFile = `${privateDir}/cloud.env`, rollbackFile = `${privateDir}/rollback-${buildId}.json`;
const deployedArchive = `.local/linux-review/deployed-source-${buildId}.zip`;
await writeFile(join(root, deployedArchive), source);

// Match only this deployment's supervisor/API and Next processes, including older releases.
const stopOwned = `async function stopOwned(){const ids=fs.readdirSync('/proc').filter(v=>/^\\d+$/.test(v)).flatMap(v=>{try{const args=fs.readFileSync('/proc/'+v+'/cmdline','utf8').split('\\0'),cwd=fs.readlinkSync('/proc/'+v+'/cwd');const owned=args.some(a=>a.startsWith('${base}/')&&(a.endsWith('/tools/review/serve.mjs')||a.endsWith('/tools/review/server.mjs')));const web=cwd.startsWith('${base}/')&&args[0]?.includes('next-server');return owned||web?[Number(v)]:[]}catch{return []}});for(const pid of ids){try{process.kill(pid,'SIGTERM')}catch{}}for(let n=0;n<100;n++){if(ids.every(pid=>{try{return /State:\\s+Z/.test(fs.readFileSync('/proc/'+pid+'/status','utf8'))}catch{return true}}))return;await new Promise(r=>setTimeout(r,200))}throw new Error('OWNED_SERVER_DID_NOT_STOP')}`;
const startOwned = (path) => `${cleanModelEnv}const log=fs.openSync('${privateDir}/server.log','a',0o600);const child=require('node:child_process').spawn(process.execPath,['--env-file=${envFile}',${path}+'/tools/review/serve.mjs'],{cwd:${path},env,detached:true,stdio:['ignore',log,log]});fs.writeFileSync('${privateDir}/server.pid',String(child.pid),{mode:0o600});child.unref();`;
let rollbackPrepared = false;
try {
  const preflight = JSON.parse(await remote("release-preflight", `const fs=require('node:fs');const active=fs.existsSync('${appAlias}')?fs.realpathSync('${appAlias}'):null;if(active==='${app}')throw new Error('RELEASE_ALREADY_ACTIVE');const disk=fs.statfsSync('/tmp');console.log(JSON.stringify({platform:process.platform,node:process.version,activeRelease:active,diskFreeBytes:Number(disk.bavail)*Number(disk.bsize)}));`));
  if (preflight.platform !== "linux") throw new Error("LINUX_HOST_REQUIRED");
  await remote("upload", `const fs=require('node:fs'),crypto=require('node:crypto');fs.mkdirSync('${release}',{recursive:true});const chunks=[];process.stdin.on('data',c=>chunks.push(c));process.stdin.on('end',()=>{const source=Buffer.concat(chunks);if(crypto.createHash('sha256').update(source).digest('hex')!=='${buildId}')throw new Error('SOURCE_UPLOAD_HASH_MISMATCH');fs.writeFileSync('${release}/source.zip',source);console.log('source-uploaded-and-hashed')});`, source);
  const extract = `from pathlib import Path; from zipfile import ZipFile; import hashlib,json,shutil; root=Path('${release}'); archive=ZipFile(root/'source.zip'); assert all(not p.filename.startswith('/') and '..' not in Path(p.filename).parts for p in archive.infolist()); target=root/'guardian-wallet'; shutil.rmtree(target,ignore_errors=True); archive.extractall(root); inventory=json.loads((target/'SOURCE-INVENTORY.json').read_text()); assert inventory['baseRevision']=='${sourceRevision}'; assert all(hashlib.sha256((target/entry['path']).read_bytes()).hexdigest()==entry['sha256'] for entry in inventory['files']); print('source-extracted-and-verified')`;
  await remote("extract", `const r=require('node:child_process').spawnSync('python3',['-c',${JSON.stringify(extract)}],{stdio:'inherit'});process.exitCode=r.status??1;`);
  await remote("build", `const{spawnSync}=require('node:child_process');for(const args of [['ci','--include=dev','--no-fund'],['run','build'],['prune','--omit=dev']]){const r=spawnSync('npm',args,{cwd:'${app}',env:{...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'},stdio:'inherit'});if(r.status!==0)process.exit(r.status||1)}console.log('production-runtime-built');`, undefined, 600000);

  // Keep the old service running through build/smoke; retain its environment for rollback.
  await remote("prepare-rollback", `const fs=require('node:fs');fs.mkdirSync('${privateDir}',{recursive:true,mode:0o700});const previousApp=fs.existsSync('${appAlias}')?fs.realpathSync('${appAlias}'):null;const previousEnvironment=fs.existsSync('${envFile}');if(previousEnvironment)fs.copyFileSync('${envFile}','${envFile}.rollback-${buildId}');fs.writeFileSync('${rollbackFile}',JSON.stringify({previousApp,previousEnvironment,switchStarted:false}),{mode:0o600});console.log('rollback-state-retained');`);
  rollbackPrepared = true;
  await remote("private-environment", `const fs=require('node:fs');const chunks=[];process.stdin.on('data',c=>chunks.push(c));process.stdin.on('end',()=>{fs.writeFileSync('${envFile}',Buffer.concat(chunks),{mode:0o600});console.log('server-secret-environment-written')});`, Buffer.from(mergeEnvironment("", variables)));
  await remote("live-workflow", `${cleanModelEnv}const r=require('node:child_process').spawnSync(process.execPath,['--env-file=${envFile}','${app}/tools/review/check-live.mjs','--record'],{cwd:'${app}/contracts',env,stdio:'inherit',timeout:240000});process.exitCode=r.status??1;`, undefined, 300000);
  const evidence = JSON.parse(await remote("retrieve-evidence", `const fs=require('node:fs');const report=JSON.parse(fs.readFileSync('${app}/docs/evidence/reviewer-live-cloud.json','utf8'));report.executionHost={platform:process.platform,node:process.version,arch:process.arch,hosting:${JSON.stringify(claimedFree ? "operator-confirmed-Free-Trial-Linux-VM" : "unclaimed-free-Linux-VM-not-final-jury-host")}};process.stdout.write(JSON.stringify(report));`));
  if (!evidence.runs?.length || !evidence.runs.every((run) => run.passed)) throw new Error("LINUX_LIVE_WORKFLOW_DID_NOT_PASS");
  await writeFile(join(directory, "live-workflow-report.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });

  await remote("activate-release", `const fs=require('node:fs');${stopOwned};(async()=>{const state=JSON.parse(fs.readFileSync('${rollbackFile}','utf8'));state.switchStarted=true;fs.writeFileSync('${rollbackFile}',JSON.stringify(state),{mode:0o600});await stopOwned();if(fs.existsSync('${appAlias}')&&!fs.lstatSync('${appAlias}').isSymbolicLink()){const backup='${base}/legacy-'+Date.now();fs.renameSync('${appAlias}',backup);state.previousApp=backup;fs.writeFileSync('${rollbackFile}',JSON.stringify(state),{mode:0o600})}const temporary='${appAlias}.next-'+process.pid;fs.symlinkSync('${app}',temporary,'dir');fs.renameSync(temporary,'${appAlias}');${startOwned(JSON.stringify(app))}console.log('review-release-activated')})().catch(()=>{console.error('ACTIVATION_FAILED');process.exitCode=1});`);
  const health = JSON.parse(await remote("health", `(async()=>{for(let n=0;n<90;n++){try{const r=await fetch('http://127.0.0.1:8080/api/review/ready',{signal:AbortSignal.timeout(10000)});const b=await r.json();if(r.ok&&b.status==='ready'&&b.buildId==='${buildId}'){console.log(JSON.stringify({ready:b,platform:process.platform,node:process.version}));return}}catch{}await new Promise(r=>setTimeout(r,1000))}throw new Error('LINUX_REVIEW_NOT_READY')})().catch(()=>{console.error('LINUX_REVIEW_NOT_READY');process.exitCode=1});`, undefined, 120000));
  let publicReady;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { const r = await fetch(`${origin}/api/review/ready`, { headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(30000) }); const body = await r.json(); if (r.ok && body.status === "ready" && body.buildId === buildId) { publicReady = body; break; } } catch { /* Retry a bounded hosting transition. */ }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  if (!publicReady) throw new Error("LINUX_PREVIEW_HTTPS_NOT_READY");
  await writeFile(join(directory, "reviewer-link.private.txt"), `${origin}/review#access=${access.accessCode}\n`, { mode: 0o600 });
  const report = { capturedAt: new Date().toISOString(), platform: "linux", sourceRevision, modelId: model.modelId, buildId, sourcePackage: deployedArchive,
    activeRelease: app, liveWorkflow: "passed", liveWorkflowReport: ".local/linux-review/live-workflow-report.json", health, previewUrl: `${origin}/review`,
    access: claimedFree ? "Owner-confirmed claimed Free/Trial VM; capability remains private; outside-network verification is separate." : "Unclaimed host; not accepted as a public jury deployment.",
    billing: "No upgrade/billing API invoked; existing operator-confirmed Free/Trial host reused", accountTierIndependentlyVerified: false, dockerImageBuilt: false };
  await writeFile(join(directory, "deployment-report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (rollbackPrepared) {
    try {
      await remote("rollback", `const fs=require('node:fs');${stopOwned};(async()=>{const state=JSON.parse(fs.readFileSync('${rollbackFile}','utf8'));if(state.previousEnvironment)fs.copyFileSync('${envFile}.rollback-${buildId}','${envFile}');if(state.switchStarted){await stopOwned();if(!state.previousApp||!fs.existsSync(state.previousApp))throw new Error('PREVIOUS_RELEASE_MISSING');if(fs.existsSync('${appAlias}')&&fs.lstatSync('${appAlias}').isSymbolicLink())fs.unlinkSync('${appAlias}');if(!fs.existsSync('${appAlias}'))fs.symlinkSync(state.previousApp,'${appAlias}','dir');${startOwned("state.previousApp")}}console.log('previous-environment-and-release-restored')})().catch(()=>{console.error('ROLLBACK_FAILED');process.exitCode=1});`);
    } catch { console.error("LINUX_ROLLBACK_REQUIRES_MANUAL_CHECK"); }
  }
  console.error(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "LINUX_DEPLOYMENT_FAILED_CHECK_PRIVATE_LOGS");
  process.exitCode = 1;
}
