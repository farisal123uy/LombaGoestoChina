import hashlib
import json
import subprocess
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[2]
output = root / "submission" / "generated"
manifest = json.loads((output / "artifact-manifest.json").read_text(encoding="utf-8"))
assert manifest["video"]["durationSeconds"] <= 300
for artifact in manifest["artifacts"]:
    assert hashlib.sha256((root / artifact["path"]).read_bytes()).hexdigest() == artifact["sha256"], "ARTIFACT_CHANGED_AFTER_VALIDATION"
files = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root).decode().split("\0")
selected = []
for name in sorted(set(filter(None, files))):
    path = Path(name)
    if path.suffix == ".zip" or ".local" in path.parts or "node_modules" in path.parts or path.name == ".git":
        continue
    if path.name.startswith(".env") and path.name != ".env.example":
        raise RuntimeError("PRIVATE_ENV_FILE_IN_CANDIDATE_LIST")
    if "submission/generated/narration/" in name or name.endswith("Guardian-Wallet-evidence-walkthrough.webm"):
        continue
    if not (root / name).is_file():
        raise RuntimeError("SOURCE_FILE_MISSING")
    selected.append(name)
archive_path = output / "Guardian-Wallet-submission-review.zip"
inventory = [{"path": name, "sha256": hashlib.sha256((root / name).read_bytes()).hexdigest()} for name in selected]
with ZipFile(archive_path, "w", ZIP_DEFLATED, compresslevel=6) as archive:
    for name in selected:
        archive.write(root / name, "guardian-wallet/" + name)
    archive.writestr("guardian-wallet/SOURCE-INVENTORY.json", json.dumps({"status": "working-tree-review-snapshot", "files": inventory}, indent=2))
with ZipFile(archive_path) as archive:
    assert archive.testzip() is None
print(json.dumps({"archive": str(archive_path), "files": len(selected), "bytes": archive_path.stat().st_size, "sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(), "privateRuntimeFilesIncluded": False, "status": "review-package-not-officially-submitted"}))
