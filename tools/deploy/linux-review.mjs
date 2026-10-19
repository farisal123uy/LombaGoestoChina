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
const options = ["-4", "-T", "-i", join(directory, "id_ed25519"), "-o", "IdentitiesOnly=yes", "-o", "ForwardAgent=no", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", `UserKnownHostsFile=${join(directory, "known_hosts")}`, "-o", "ConnectTimeout=20", "railway.new"];
const quote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
async function remote(stage, code, input, timeout = 120000) {
  const result = spawnSync("ssh", [...options, `node -e ${quote(code)}`], { input, encoding: "utf8", timeout, maxBuffer: 12 * 1024 * 1024, windowsHide: true });
  await writeFile(join(directory, `${stage}.stdout.private.log`), result.stdout || "", { mode: 0o600 });
  await writeFile(join(directory, `${stage}.stderr.private.log`), result.stderr || "", { mode: 0o600 });
  try {
    const pending = JSON.parse(result.stdout || "null");
    if (pending?.status === "claim_required") {
      const url = new URL(pending.human_claim_url);
      if (url.hostname === "railway.com" || url.hostname.endsWith(".railway.com")) await writeFile(join(directory, "claim-link.private.txt"), `${url.toString()}\n`, { mode: 0o600 });
      throw new Error("HUMAN_FREE_ACCOUNT_CLAIM_REQUIRED");
    }
  } catch (error) { if (error.message === "HUMAN_FREE_ACCOUNT_CLAIM_REQUIRED") throw error; }
  if (result.status !== 0) throw new Error(`LINUX_${stage.toUpperCase()}_FAILED`);
  console.log(JSON.stringify({ stage, status: "passed" }));
  return result.stdout || "";
}
const app = "/tmp/guardian-review/guardian-wallet", privateDir = "/tmp/guardian-review-private", envFile = `${privateDir}/cloud.env`;
const source = await readFile(join(root, ".local/release/Guardian-Wallet-source-review.zip"));
const buildId = createHash("sha256").update(source).digest("hex");
const deployedArchive = `.local/linux-review/deployed-source-${buildId}.zip`;
await writeFile(join(root, deployedArchive), source);
await remote("stop-server", `(async()=>{const fs=require('node:fs');const ids=fs.readdirSync('/proc').filter(v=>/^\\d+$/.test(v)).flatMap(v=>{try{const args=fs.readFileSync('/proc/'+v+'/cmdline','utf8').split('\\0');const cwd=fs.readlinkSync('/proc/'+v+'/cwd');const exact=args.some(a=>a==='${app}/tools/review/serve.mjs'||a==='${app}/tools/review/server.mjs');const web=cwd==='${app}/apps/web'&&args[0]?.includes('next-server');return exact||web?[Number(v)]:[]}catch{return []}});for(const pid of ids){try{process.kill(pid,'SIGTERM')}catch{}}for(let n=0;n<100;n++){if(ids.every(pid=>{try{return /State:\\s+Z/.test(fs.readFileSync('/proc/'+pid+'/status','utf8'))}catch{return true}})){console.log(JSON.stringify({ownedProcessesStopped:ids.length}));return}await new Promise(r=>setTimeout(r,200))}throw new Error('OLD_SERVER_DID_NOT_STOP')})().catch(()=>{console.error('SAFE_SERVER_STOP_FAILED');process.exitCode=1});`);
await remote("upload", `const fs=require('node:fs');fs.mkdirSync('/tmp/guardian-review',{recursive:true});const chunks=[];process.stdin.on('data',c=>chunks.push(c));process.stdin.on('end',()=>{fs.writeFileSync('/tmp/guardian-review/source.zip',Buffer.concat(chunks));console.log('source-uploaded')})`, source);
const extract = "from pathlib import Path; from zipfile import ZipFile; root=Path('/tmp/guardian-review'); archive=ZipFile(root/'source.zip'); assert all(not p.filename.startswith('/') and '..' not in Path(p.filename).parts for p in archive.infolist()); archive.extractall(root)";
await remote("extract", `const{spawnSync}=require('node:child_process');const r=spawnSync('python3',['-c',${JSON.stringify(extract)}],{stdio:'inherit'});process.exitCode=r.status??1;`);
await remote("build", `const{spawnSync}=require('node:child_process');for(const args of [['ci','--include=dev','--no-fund'],['run','build'],['prune','--omit=dev']]){const r=spawnSync('npm',args,{cwd:${JSON.stringify(app)},env:{...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1'},stdio:'inherit'});if(r.status!==0)process.exit(r.status||1)}console.log('production-runtime-built');`, undefined, 600000);

const model = await loadModelOptions(); new StructuredModelClient(model);
let access;
try { access = JSON.parse(await readFile(join(directory, "access.private.json"), "utf8")); } catch { access = { accessCode: randomBytes(32).toString("hex") }; await writeFile(join(directory, "access.private.json"), `${JSON.stringify(access)}\n`, { mode: 0o600 }); }
const variables = { AI_PROVIDER: "groq", AI_MODEL_ID: model.modelId, GROQ_API_KEY: model.apiKey, GROQ_FREE_TIER_CONFIRMED: "true", REVIEW_ACCESS_CODE: access.accessCode,
  AI_REQUEST_TIMEOUT_MS: "30000", AI_CONTEXT_TOKENS: "4096", AI_OUTPUT_TOKENS: String(cloudModelProfiles[model.modelId].defaultCompletionTokens), REVIEW_MAX_SESSIONS: "1", REVIEW_BUILD_ID: buildId, PORT: "8080", KERNEL_FORK_RPC_URL: "https://sepolia.base.org", NODE_ENV: "production" };
await remote("private-environment", `const fs=require('node:fs');fs.mkdirSync(${JSON.stringify(privateDir)},{recursive:true,mode:0o700});const chunks=[];process.stdin.on('data',c=>chunks.push(c));process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(envFile)},Buffer.concat(chunks),{mode:0o600});console.log('server-secret-environment-written')})`, Buffer.from(mergeEnvironment("", variables)));
const cleanModelEnv = `const env={...process.env};for(const key of ${JSON.stringify(Object.keys(variables))})delete env[key];`;
await remote("live-workflow", `${cleanModelEnv}const{spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['--env-file=${envFile}','${app}/tools/review/check-live.mjs','--record'],{cwd:'${app}/contracts',env,stdio:'inherit',timeout:180000});console.log(JSON.stringify({marker:'linux-live-child-outcome',status:r.status,signal:r.signal,errorCode:r.error?.code}));process.exitCode=r.status??1;`, undefined, 240000);
const evidenceText = await remote("retrieve-evidence", `const fs=require('node:fs');const report=JSON.parse(fs.readFileSync('${app}/docs/evidence/reviewer-live-cloud.json','utf8'));report.executionHost={platform:process.platform,node:process.version,arch:process.arch,hosting:${JSON.stringify(claimedFree ? "operator-confirmed-Free-Trial-Linux-VM" : "unclaimed-free-Linux-VM-not-final-jury-host")}};process.stdout.write(JSON.stringify(report));`);
const evidence = JSON.parse(evidenceText);
if (!evidence.runs?.every((run) => run.passed)) throw new Error("LINUX_LIVE_WORKFLOW_DID_NOT_PASS");
await writeFile(join(root, "docs/evidence/reviewer-linux-cloud.json"), `${JSON.stringify(evidence, null, 2)}\n`);

await remote("start-server", `${cleanModelEnv}const fs=require('node:fs'),{spawn}=require('node:child_process');const log=fs.openSync('${privateDir}/server.log','a');const child=spawn(process.execPath,['--env-file=${envFile}','${app}/tools/review/serve.mjs'],{cwd:'${app}',env,detached:true,stdio:['ignore',log,log]});fs.writeFileSync('${privateDir}/server.pid',String(child.pid),{mode:0o600});child.unref();console.log('server-started');`);
const healthText = await remote("health", `(async()=>{for(let n=0;n<90;n++){try{const response=await fetch('http://127.0.0.1:8080/api/review/ready');const body=await response.json();if(response.ok&&body.status==='ready'){console.log(JSON.stringify({ready:body,platform:process.platform,node:process.version}));return}}catch{}await new Promise(r=>setTimeout(r,1000))}throw new Error('LINUX_REVIEW_NOT_READY')})().catch(()=>{console.error('LINUX_REVIEW_NOT_READY');process.exitCode=1});`, undefined, 110000);
const health = JSON.parse(healthText);
if (health.ready.buildId !== buildId) throw new Error("LINUX_BUILD_ID_MISMATCH");
const previewUrl = connection.previewUrl;
if (previewUrl) {
  const response = await fetch(`${previewUrl}/api/review/ready`, { signal: AbortSignal.timeout(30000) });
  const publicReady = await response.json();
  if (!response.ok || publicReady.status !== "ready" || publicReady.buildId !== buildId) throw new Error("LINUX_PREVIEW_HTTPS_NOT_READY");
  await writeFile(join(directory, "reviewer-link.private.txt"), `${previewUrl}/review#access=${access.accessCode}\n`, { mode: 0o600 });
}
const report = { capturedAt: new Date().toISOString(), platform: "linux", modelId: model.modelId, buildId, sourcePackage: deployedArchive, liveWorkflow: "passed", health,
  previewUrl: previewUrl ? `${previewUrl}/review` : null,
  access: claimedFree ? "Human-confirmed claimed VM. Public and China-network checks are separate; reviewer capability remains private." : "Creator-IP restricted while unclaimed. Private access/claim details are in .local/linux-review. This is not an official jury URL.",
  billing: claimedFree ? "operator-confirmed-Free-Trial-no-payment-method-no-paid-upgrade-invoked" : "unclaimed-free-VM-no-billing-activation", accountTierIndependentlyVerified: false, dockerImageBuilt: false };
await writeFile(join(directory, "deployment-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
