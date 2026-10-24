"""Build a source-only runtime ZIP outside the repository; never install or touch Saves."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
out = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else Path.home() / 'Documents/Civ7-Mod-Releases' / f'map-tools-gamepad-{stamp}'
if out.is_relative_to(root.parents[1]):
    raise SystemExit('Release files must be outside the repository.')
out.mkdir(parents=True, exist_ok=True)
files = [root / 'map-tools-gamepad.modinfo', root / 'README.md', root / 'README-en.md', root / 'VALIDATION.md']
files += sorted((root / 'ui').glob('*')) + sorted((root / 'text').glob('*.xml'))
archive = out / 'better-controller-support-0.2.1.zip'
manifest = {str(p.relative_to(root)): {'size': p.stat().st_size, 'sha256': sha256(p.read_bytes()).hexdigest()} for p in files}
with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as bundle:
    for path in files:
        bundle.write(path, Path(root.name) / path.relative_to(root))
with zipfile.ZipFile(archive) as bundle:
    assert sorted(bundle.namelist()) == sorted(f'{root.name}/{name}' for name in manifest)
    for name, info in manifest.items():
        data = bundle.read(f'{root.name}/{name}')
        assert len(data) == info['size'] and sha256(data).hexdigest() == info['sha256']
evidence = {'version': '0.2.1', 'createdAt': stamp, 'archive': str(archive), 'archiveSha256': sha256(archive.read_bytes()).hexdigest(), 'files': manifest}
(out / 'manifest.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'archive': str(archive), 'manifest': str(out / 'manifest.json'), 'files': len(files), 'verified': True}))
