"""Create a local review/install archive. Does not install or publish."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
output = parser.parse_args().output
output.parent.mkdir(parents=True, exist_ok=True)
files = [ROOT / name for name in ("better-chinese-support.modinfo", "README.md", "NOTICE.md", "VALIDATION.md")]
files += [ROOT / "text" / name for name in ("metadata.xml", "functional.sql", "mechanics.sql")]
assert {p.name for p in (ROOT / "text").iterdir()} == {"metadata.xml", "functional.sql", "mechanics.sql"}
manifest = []
with zipfile.ZipFile(output, "x", zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        relative = "civ7-better-chinese-support/" + str(file.relative_to(ROOT))
        data = file.read_bytes()
        archive.writestr(relative, data)
        manifest.append(dict(path=relative, size=len(data), sha256=hashlib.sha256(data).hexdigest()))
with zipfile.ZipFile(output) as archive:
    assert sorted(archive.namelist()) == sorted(x["path"] for x in manifest)
    for entry in manifest:
        data = archive.read(entry["path"])
        assert len(data) == entry["size"]
        assert hashlib.sha256(data).hexdigest() == entry["sha256"]
receipt = dict(status="local-only-not-installed-not-published", archive=output.name,
               sha256=hashlib.sha256(output.read_bytes()).hexdigest(), files=manifest)
output.with_suffix(".manifest.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+"\n")
print(json.dumps(dict(archive=str(output), files=len(files), sha256=receipt["sha256"])))
