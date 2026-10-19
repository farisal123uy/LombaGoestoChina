"""Compare the saved deployed archive to the active local application source."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parents[2]
deployment = json.loads((root / ".local/linux-review/deployment-report.json").read_text(encoding="utf-8"))
source = root / deployment["sourcePackage"]
assert hashlib.sha256(source.read_bytes()).hexdigest() == deployment["buildId"], "DEPLOYED_ARCHIVE_HASH_MISMATCH"
runtime_tools = {"tools/review/serve.mjs", "tools/review/server.mjs", "tools/review/workspace.mjs", "tools/review/network-runtime.mjs"}
changed_runtime = []
changed_evidence = []
checked = 0
with ZipFile(source) as archive:
    assert archive.testzip() is None
    inventory = json.loads(archive.read("guardian-wallet/SOURCE-INVENTORY.json"))
    for entry in inventory["files"]:
        name = entry["path"]
        runtime = name.startswith(("apps/api/src/", "apps/worker/src/", "apps/web/components/", "apps/web/lib/", "apps/web/app/", "packages/")) or name in runtime_tools
        if runtime and not name.endswith((".test.ts", ".test.tsx", ".md")):
            checked += 1
            path = root / name
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
                changed_runtime.append(name)
        if name.startswith("docs/evidence/") and name.endswith(".json"):
            path = root / name
            if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
                changed_evidence.append(name)
report = {
    "deployedSourceSha256": deployment["buildId"],
    "savedDeployedArchive": deployment["sourcePackage"],
    "runtimeFilesCompared": checked,
    "changedRuntimeFiles": changed_runtime,
    "evidenceCapturesUpdatedLocallyAfterDeployment": changed_evidence,
    "runtimeMatchesSavedDeployment": not changed_runtime,
    "scope": "Application/package/review runtime source from the deployed inventory; local documentation/checker/recent evidence additions are packaged separately.",
}
(root / ".local/release/deployment-comparison.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
if changed_runtime:
    raise SystemExit(1)
