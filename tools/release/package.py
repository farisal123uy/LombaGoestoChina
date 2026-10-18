"""Source-only review snapshot. Does not create a deck, video or official submission."""
import hashlib
import json
import re
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[2]
output = root / ".local" / "release"
output.mkdir(parents=True, exist_ok=True)
names = subprocess.check_output(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root
).decode("utf-8").split("\0")
excluded = {".git", ".local", "node_modules", ".next", "dist", "coverage", "test-results", "playwright-report", "__pycache__"}
files = []
fixture_exceptions = []
# Reviewed literal used by an existing negative model-ID validation test. This
# exception applies to this exact value/path, never to a whole test directory.
known_fixture = ("tests/integration/services-setup.test.ts", b"sk-proj-" + b"this-is-a-key-not-a-model")
patterns = [re.compile(rb"gsk_[A-Za-z0-9_-]{24,}"), re.compile(rb"sk-proj-[A-Za-z0-9_-]{24,}"), re.compile(rb"(?:AGENT_SESSION_PRIVATE_KEY|PROVIDER_SIGNER_PRIVATE_KEY)\s*=\s*[\"']?0x[0-9a-fA-F]{64}")]
for name in sorted(set(filter(None, names))):
    path = Path(name)
    if any(part in excluded for part in path.parts) or path.suffix.lower() in {".zip", ".wav", ".webm", ".mp4", ".pptx", ".log", ".tsbuildinfo"}:
        continue
    if path.name.startswith(".env") and path.name != ".env.example":
        raise RuntimeError("PRIVATE_ENV_IN_SOURCE_CANDIDATE")
    source = root / path
    if not source.is_file():
        raise RuntimeError("SOURCE_CANDIDATE_MISSING")
    content = source.read_bytes()
    for pattern in patterns:
        for match in pattern.finditer(content):
            if (name, match.group()) == known_fixture:
                fixture_exceptions.append({"path": name, "reason": "Reviewed non-secret negative model-ID fixture"})
            else:
                raise RuntimeError("POSSIBLE_CREDENTIAL_IN_SOURCE: " + name)
    files.append((name, content))

components = {}
for manifest in [root / "package.json", *sorted((root / "apps").glob("*/package.json")), *sorted((root / "packages").glob("*/package.json")), root / "contracts/package.json"]:
    data = json.loads(manifest.read_text(encoding="utf-8"))
    for name in {**data.get("dependencies", {}), **data.get("devDependencies", {})}:
        if name.startswith("@guardian-wallet/"):
            continue
        installed = root / "node_modules" / name / "package.json"
        if installed.exists():
            metadata = json.loads(installed.read_text(encoding="utf-8"))
            components[name] = {"name": name, "version": metadata.get("version"), "license": metadata.get("license", "REVIEW_REQUIRED"), "repository": metadata.get("repository")}

lockfile = json.loads((root / "package-lock.json").read_text(encoding="utf-8"))
locked_components = []
license_texts = {}
for install_path, entry in sorted(lockfile.get("packages", {}).items()):
    if not install_path.startswith("node_modules/") or entry.get("link"):
        continue
    folder = root / install_path
    metadata_file = folder / "package.json"
    metadata = json.loads(metadata_file.read_text(encoding="utf-8")) if metadata_file.is_file() else {}
    name = metadata.get("name", entry.get("name", install_path.rsplit("node_modules/", 1)[-1]))
    version = entry.get("version", metadata.get("version"))
    license_value = metadata.get("license", entry.get("license", "REVIEW_REQUIRED"))
    license_source = "installed-package-metadata" if metadata.get("license") else "lockfile-metadata"
    # Reviewed exact upstream version: its package.json omits license metadata,
    # but its bundled LICENSE explicitly grants MIT with Nomic's copyright.
    if license_value == "REVIEW_REQUIRED" and name == "@nomicfoundation/ignition-ui" and version == "3.2.0":
        notice = (folder / "LICENSE").read_text(encoding="utf-8")
        assert notice.startswith("MIT License") and "Copyright (c) 2025 Nomic Foundation" in notice and "Permission is hereby granted, free of charge" in notice
        license_value = "MIT"
        license_source = "reviewed-installed-LICENSE; manifest field absent"
    notices = []
    if folder.is_dir():
        for notice in sorted(folder.iterdir()):
            if notice.is_file() and re.match(r"^(?:licen[sc]e|notice|copyright)(?:[._-].*)?$", notice.name, re.IGNORECASE):
                archive_name = "THIRD-PARTY-LICENSES/" + install_path.removeprefix("node_modules/") + "/" + notice.name
                notice_content = notice.read_bytes()
                license_texts[archive_name] = notice_content
                notices.append({"path": archive_name, "sha256": hashlib.sha256(notice_content).hexdigest()})
    locked_components.append({"name": name, "version": version, "license": license_value, "licenseSource": license_source, "installPath": install_path, "developmentOnly": entry.get("dev", False), "optional": entry.get("optional", False), "installedOnPackagingHost": bool(metadata), "notices": notices})
missing_license_metadata = [entry["installPath"] for entry in locked_components if entry["license"] == "REVIEW_REQUIRED"]

inventory = {
    "status": "working-tree-source-review-not-official-submission",
    "baseRevision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root).decode().strip(),
    "finalPublishedRevision": None,
    # This is the revision actually integrated, not whichever origin points to later.
    "integratedFrontendRevision": "4e47b138f1df397291aef5e696dd112b2266bdb7",
    "files": [{"path": name, "sha256": hashlib.sha256(content).hexdigest()} for name, content in files],
    "scope": "Source, technical docs, configuration templates and labeled evidence. No credentials, dependencies, presentations or videos.",
    "licenseInventoryScope": "Direct installed inventory plus full lockfile dependency/license metadata; bundled top-level installed LICENSE/NOTICE/COPYRIGHT files. Not a legal assessment or model-weight distribution.",
    "credentialScanFixtureExceptions": fixture_exceptions,
}
archive_path = output / "Guardian-Wallet-source-review.zip"
with ZipFile(archive_path, "w", ZIP_DEFLATED, compresslevel=6) as archive:
    for name, content in files:
        archive.writestr("guardian-wallet/" + name, content)
    archive.writestr("guardian-wallet/SOURCE-INVENTORY.json", json.dumps(inventory, indent=2))
    archive.writestr("guardian-wallet/THIRD-PARTY-INVENTORY.json", json.dumps(list(components.values()), indent=2))
    archive.writestr("guardian-wallet/THIRD-PARTY-LOCKFILE-INVENTORY.json", json.dumps(locked_components, indent=2))
    for name, content in sorted(license_texts.items()):
        archive.writestr("guardian-wallet/" + name, content)
with ZipFile(archive_path) as archive:
    assert archive.testzip() is None
    for entry in inventory["files"]:
        assert hashlib.sha256(archive.read("guardian-wallet/" + entry["path"])).hexdigest() == entry["sha256"]
report = {"archive": str(archive_path.relative_to(root)), "files": len(files), "bytes": archive_path.stat().st_size, "sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(), "privateRuntimeFilesIncluded": False, "credentialPatternScan": "selected-patterns-no-unreviewed-matches-not-a-universal-secret-proof", "reviewedNonSecretFixtureExceptions": len(fixture_exceptions), "lockedDependenciesInventoried": len(locked_components), "installedLicenseNoticeFilesIncluded": len(license_texts), "missingLicenseMetadata": missing_license_metadata, "status": inventory["status"]}
(output / "source-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
(output / "package-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
