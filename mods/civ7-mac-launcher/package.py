"""Build the standalone launcher and optional first-party providers. Never installs or runs the game."""
from pathlib import Path
import argparse, hashlib, json, plistlib, shutil, subprocess, uuid, zipfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
parser.add_argument('--node', type=Path, help='Official standalone ARM64 Node 22+ binary; enables the extension registry host')
parser.add_argument('--node-license', type=Path)
parser.add_argument('--native-input', action='store_true')
parser.add_argument('--extension-dir', type=Path, action='append', default=[], help='Installed-mod layout with better-mod-support.json; repeat for any provider')
a = parser.parse_args()
if a.node:
    if not a.node_license or not a.node_license.is_file(): parser.error('--node-license is required for redistribution')
    info = json.loads(subprocess.check_output([str(a.node), '-p', 'JSON.stringify({arch:process.arch,major:+process.versions.node.split(".")[0]})']))
    if info['arch'] != 'arm64' or info['major'] < 22: parser.error('ARM64 Node 22+ required')
    dependencies = subprocess.check_output(['/usr/bin/otool','-L',str(a.node)], text=True).splitlines()[1:]
    if any(not row.strip().startswith(('/usr/lib/','/System/Library/')) for row in dependencies): parser.error('Node must not require Homebrew/external libraries')
out=a.output.resolve(); out.mkdir(parents=True,exist_ok=True)
stage=out/('stage-'+uuid.uuid4().hex[:8]); payload=stage/'civ7-mac-launcher'; payload.mkdir(parents=True)
app=payload/'Civ7 Mod Launcher.app'; contents=app/'Contents'; resources=contents/'Resources'
for d in ['MacOS','Resources','Frameworks']: (contents/d).mkdir(parents=True)
subprocess.run(['/usr/bin/clang++','-arch','arm64','-mmacosx-version-min=11.0','-std=c++17','-fobjc-arc','-O2','-Wall','-Wextra','-framework','Cocoa',str(ROOT/'src/launcher.mm'),'-o',str(contents/'MacOS/Civ7ModLauncher')],check=True)
info={'CFBundleExecutable':'Civ7ModLauncher','CFBundleIdentifier':'org.stupidism.civ7-mod-launcher','CFBundleName':'Better Mod Support','CFBundleDisplayName':'更好的Mod支持','CFBundlePackageType':'APPL','CFBundleShortVersionString':'0.2.0','CFBundleVersion':'2','RegistryMode':bool(a.node),'LSMinimumSystemVersion':'14.0' if a.node else '11.0','NSHighResolutionCapable':True}
if a.native_input:
    native=REPO/'tools/civ7-native-debug-input'
    subprocess.run(['/bin/sh',str(native/'build.sh')],check=True)
    bridge=contents/'Frameworks/libCiv7NativeInput.dylib'; shutil.copy2(native/'build/libCiv7NativeInput.dylib',bridge)
    info['BridgeSHA256']=hashlib.sha256(bridge.read_bytes()).hexdigest()
if a.node:
    shutil.copy2(a.node,resources/'node'); shutil.copy2(a.node_license,resources/'NODE-LICENSE.txt')
    for file in (ROOT/'runtime').glob('*.mjs'): shutil.copy2(file,resources/file.name)
    manifest={str(p.relative_to(resources)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(resources.rglob('*')) if p.is_file()}
    (resources/'helper-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(contents/'Info.plist').write_bytes(plistlib.dumps(info))
subprocess.run(['/usr/bin/codesign','--force','--sign','-',str(app)],check=True)
subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(app)],check=True)
for file in ['launcher.modinfo','README.md','VALIDATION.md']: shutil.copy2(ROOT/file,payload/file)
shutil.copytree(ROOT/'text',payload/'text')
shutil.copytree(ROOT/'ui',payload/'ui')
for source in a.extension_dir:
    source=source.resolve()
    spec=json.loads((source/'better-mod-support.json').read_text())
    import re
    if spec.get('apiVersion') != 1 or not re.fullmatch(r'[a-z][a-z0-9-]{2,79}', spec.get('id','')): raise SystemExit('Invalid extension manifest')
    target=stage/spec['id']
    if target.exists(): raise SystemExit('Duplicate extension in package')
    shutil.copytree(source,target,ignore=shutil.ignore_patterns('tests','build','node_modules','.DS_Store'))
shutil.copy2(ROOT/'Install.command',stage/'Install.command')

files={str(p.relative_to(stage)):{'size':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(stage.rglob('*')) if p.is_file()}
(stage/'manifest.json').write_text(json.dumps(files,ensure_ascii=False,indent=2)+'\n')
archive=out/'civ7-mac-launcher-0.2.0-dev-macos-arm64.zip'
if archive.exists(): raise SystemExit('Archive exists; use a new output directory')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(stage.rglob('*')): z.write(p,p.relative_to(stage))
print(json.dumps({'stage':str(stage),'archive':str(archive),'files':len(files),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}))
