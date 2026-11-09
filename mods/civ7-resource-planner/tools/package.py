#!/usr/bin/env python3
"""Build a standalone Civilization VII Resource Planner archive."""

import argparse
import datetime
import hashlib
import json
import os
import shutil
import stat
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path, PurePosixPath


MOD_ID = "civ7-resource-planner"
RECEIPT_NAME = "package-receipt.json"
RECEIPT_SHA_NAME = "package-receipt.sha256"


def local_name(name):
    return name.rsplit("}", 1)[-1]


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_relative_path(source, name):
    if not name or "\0" in name or "\\" in name or name.startswith("/"):
        raise SystemExit(f"Unsafe manifest path: {name!r}")

    relative = PurePosixPath(name)
    if relative.is_absolute() or any(part in ("", ".", "..") for part in relative.parts):
        raise SystemExit(f"Unsafe manifest path: {name!r}")

    path = source / Path(*relative.parts)
    parent = source
    for component in relative.parts[:-1]:
        parent = parent / component
        if parent.is_symlink():
            raise SystemExit(f"Manifest path must not traverse a symlink: {name}")
    if path.is_symlink():
        raise SystemExit(f"Manifest path must not be a symlink: {name}")
    try:
        resolved = path.resolve(strict=True)
    except FileNotFoundError:
        raise SystemExit(f"Manifest path does not exist: {name}")
    if resolved != source and source not in resolved.parents:
        raise SystemExit(f"Manifest path escapes the mod directory: {name}")
    if not stat.S_ISREG(resolved.stat().st_mode):
        raise SystemExit(f"Manifest path is not a regular file: {name}")
    return path


def reject_packaging_artifacts(name):
    relative = PurePosixPath(name)
    lower_parts = tuple(part.lower() for part in relative.parts)
    forbidden_directories = {"tests", "docs", "evidence", "screenshots", "logs"}
    if (
        relative.name.lower() == "validation.md"
        or "action-order-migration" in relative.name.lower()
        or relative.suffix.lower() == ".log"
        or any(part in forbidden_directories for part in lower_parts)
    ):
        raise SystemExit(f"Packaging artifact is not part of the mod release: {name}")


def read_plan(source):
    manifests = list(source.glob("*.modinfo"))
    if len(manifests) != 1:
        raise SystemExit(f"Expected exactly one .modinfo file, found {len(manifests)}")

    manifest = manifests[0]
    if manifest.parent != source or manifest.is_symlink():
        raise SystemExit(f"Unsafe mod manifest: {manifest.name}")
    manifest = manifest.resolve(strict=True)
    try:
        root = ET.parse(manifest).getroot()
    except ET.ParseError as error:
        raise SystemExit(f"Invalid mod manifest XML: {error}")

    properties = next((child for child in root if local_name(child.tag) == "Properties"), None)
    version = None
    if properties is not None:
        version = next((child.text for child in properties if local_name(child.tag) == "Version"), None)
        version = version.strip() if version else None
    if not version or any(character in version for character in ("/", "\\", "\0")):
        raise SystemExit("Mod manifest must contain a safe Version value")

    references = []
    for element in root.iter():
        if local_name(element.tag) in ("Item", "File"):
            references.append((element.text or "").strip())

    required = [manifest.name, "README.md", "README-en.md", "NOTICE.md", "CHANGELOG.md"]
    names = sorted(set(required + references))
    paths = {}
    for name in names:
        reject_packaging_artifacts(name)
        path = safe_relative_path(source, name)
        if path.suffix.lower() == ".xml":
            try:
                ET.parse(path)
            except ET.ParseError as error:
                raise SystemExit(f"Invalid XML in {name}: {error}")
        paths[name] = path
    return manifest, version, paths


def inventory_files(paths):
    inventory = {}
    for name, path in paths.items():
        inventory[name] = {
            "size": path.stat().st_size,
            "sha256": sha256_file(path),
        }
    return inventory


def assert_source_unchanged(paths, inventory):
    for name, expected in inventory.items():
        current_size = paths[name].stat().st_size
        current_digest = sha256_file(paths[name])
        if current_size != expected["size"] or current_digest != expected["sha256"]:
            raise SystemExit(f"Source changed during packaging: {name}")


def write_archive(archive, paths, inventory):
    timestamp = (1980, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(archive, "x", zipfile.ZIP_DEFLATED, compresslevel=9) as mod_zip:
        for name, expected in inventory.items():
            data = paths[name].read_bytes()
            if len(data) != expected["size"] or hashlib.sha256(data).hexdigest() != expected["sha256"]:
                raise SystemExit(f"Source changed while reading: {name}")
            entry = zipfile.ZipInfo(f"civ7-resource-planner/{name}", date_time=timestamp)
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = 0o644 << 16
            mod_zip.writestr(entry, data)

    with zipfile.ZipFile(archive) as mod_zip:
        expected_names = {f"civ7-resource-planner/{name}" for name in inventory}
        if set(mod_zip.namelist()) != expected_names:
            raise SystemExit("Archive entry set does not match the package inventory")
        if mod_zip.testzip() is not None:
            raise SystemExit("Archive CRC validation failed")
        for name, expected in inventory.items():
            data = mod_zip.read(f"civ7-resource-planner/{name}")
            if len(data) != expected["size"] or hashlib.sha256(data).hexdigest() != expected["sha256"]:
                raise SystemExit(f"Archived bytes do not match source: {name}")


def resolve_output(requested, repository):
    if requested is None:
        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        candidate = Path.home() / "Documents" / "Civ7-Mod-Releases" / f"{MOD_ID}-{timestamp}"
    else:
        candidate = requested
    output = candidate.expanduser().resolve()
    if output == repository or output.is_relative_to(repository):
        raise SystemExit("Output directory must be outside this repository")
    if output.exists() or output.is_symlink():
        raise SystemExit(f"Output directory already exists: {output}")
    return output


def publish_staging(staging, output):
    output.mkdir()
    moved = []
    try:
        for entry in sorted(staging.iterdir()):
            destination = output / entry.name
            if destination.exists() or destination.is_symlink():
                raise SystemExit(f"Output file already exists: {destination.name}")
            os.rename(entry, destination)
            moved.append(destination)
        staging.rmdir()
    except Exception:
        for destination in moved:
            if destination.is_file() or destination.is_symlink():
                destination.unlink()
            elif destination.is_dir():
                shutil.rmtree(destination)
        if output.is_dir():
            output.rmdir()
        raise


def main():
    source = Path(__file__).resolve().parents[1]
    repository = source.parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="New, unique output directory outside this repository")
    arguments = parser.parse_args()

    output = resolve_output(arguments.output, repository)
    manifest, version, paths = read_plan(source)
    inventory = inventory_files(paths)

    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}.tmp-", dir=output.parent))
    try:
        archive = staging / f"{MOD_ID}-{version}.zip"
        write_archive(archive, paths, inventory)
        assert_source_unchanged(paths, inventory)
        manifest_again, version_again, paths_again = read_plan(source)
        if manifest_again != manifest or version_again != version or set(paths_again) != set(paths):
            raise SystemExit("Manifest changed during packaging")
        assert_source_unchanged(paths, inventory)

        receipt = {
            "modId": MOD_ID,
            "version": version,
            "archive": archive.name,
            "archiveSize": archive.stat().st_size,
            "archiveSha256": sha256_file(archive),
            "fileCount": len(inventory),
            "files": inventory,
            "verification": {
                "manifestParsed": True,
                "xmlParsed": True,
                "archiveEntriesExact": True,
                "archiveBytesExact": True,
                "sourceRechecked": True,
            },
            "installed": False,
            "published": False,
        }
        receipt_path = staging / RECEIPT_NAME
        receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        receipt_digest = sha256_file(receipt_path)
        (staging / RECEIPT_SHA_NAME).write_text(f"{receipt_digest}  {RECEIPT_NAME}\n", encoding="ascii")
        publish_staging(staging, output)
        staging = None
    finally:
        if staging is not None and staging.exists():
            shutil.rmtree(staging)

    print(json.dumps({
        "output": str(output),
        "archive": f"{MOD_ID}-{version}.zip",
        "version": version,
        "files": len(inventory),
        "receiptSha256": receipt_digest,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
