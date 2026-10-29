from pathlib import Path
import hashlib,json,plistlib,shutil,stat,subprocess,sys,uuid,zipfile

ROOT=Path(__file__).resolve().parent
OUT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/'build'/'release'
OUT.mkdir(parents=True,exist_ok=True)
VERSION='0.3.0-dev'
stage=OUT/('stage-'+uuid.uuid4().hex[:8]);stage.mkdir()
payload=stage/'Civ7-Mac-Debug-Input';payload.mkdir()
app=payload/'启动文明7（输入修复）.app'
for name in ['MacOS','Frameworks','Resources']:(app/'Contents'/name).mkdir(parents=True,exist_ok=True)
subprocess.run(['/bin/sh',str(ROOT/'build.sh')],check=True)
subprocess.run(['/usr/bin/clang++','-arch','arm64','-mmacosx-version-min=11.0','-std=c++17','-fobjc-arc','-O2','-Wall','-Wextra','-framework','Cocoa',str(ROOT/'launcher.mm'),'-o',str(app/'Contents/MacOS/Civ7InputLauncher')],check=True)
bridge=app/'Contents/Frameworks/libCiv7NativeInput.dylib'
shutil.copy2(ROOT/'build/libCiv7NativeInput.dylib',bridge)
info={'CFBundleExecutable':'Civ7InputLauncher','CFBundleIdentifier':'org.stupidism.civ7-native-input-launcher','CFBundleName':'Civ7 Input Launcher','CFBundleDisplayName':'启动文明7（输入修复）','CFBundlePackageType':'APPL','CFBundleShortVersionString':'0.3.0','CFBundleVersion':'3','LSMinimumSystemVersion':'11.0','NSHighResolutionCapable':True,'DefaultNativeInput':True,'BridgeSHA256':hashlib.sha256(bridge.read_bytes()).hexdigest()}
(app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
subprocess.run(['/usr/bin/codesign','--force','--sign','-',str(app)],check=True)
subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(app)],check=True)
(payload/'使用说明 Read Me.txt').write_text('0.3.0-dev: shared launcher extraction; new build not live validated. 以下 0.2.0 操作与验收记录为历史资料。\n\n'+(ROOT/'USER-GUIDE.txt').read_text())
validation=ROOT/'VALIDATION.txt'
if validation.exists():(payload/'VALIDATION.txt').write_text('0.3.0-dev: offline validation only. Historical 0.2.0 evidence follows.\n\n'+validation.read_text())
else:(payload/'VALIDATION.txt').write_text('0.2.0 launcher package: live validation pending. Native bridge reveal all validated separately on 2026-10-29.\n')
(payload/'native-debug-input.modinfo').write_text('''<?xml version="1.0" encoding="utf-8"?>
<Mod xmlns="ModInfo" id="civ7-native-debug-input-launcher" version="3">
  <Properties><Name>LOC_C7NI_NAME</Name><Description>LOC_C7NI_DESCRIPTION</Description><Authors>Stupidism</Authors><Version>0.3.0-dev</Version><Package>Mod</Package><AffectsSavedGames>0</AffectsSavedGames><ShowInBrowser>1</ShowInBrowser><EnabledByDefault>0</EnabledByDefault></Properties>
  <ActionCriteria><Criteria id="always"><AlwaysMet /></Criteria></ActionCriteria>
  <ActionGroups><ActionGroup id="c7ni-info" scope="shell" criteria="always"><Actions><UpdateText><Item>text/launcher.xml</Item></UpdateText></Actions></ActionGroup></ActionGroups>
</Mod>
''')
(payload/'text').mkdir()
(payload/'text/launcher.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<Database>
  <EnglishText><Row Tag="LOC_C7NI_NAME"><Text>Mac Native DebugPanel Input Launcher</Text></Row><Row Tag="LOC_C7NI_DESCRIPTION"><Text>Mac only. Open this Workshop item's folder and run the bundled app. Enabling this entry does not load the native input fix.</Text></Row></EnglishText>
  <LocalizedText><Row Tag="LOC_C7NI_NAME" Language="zh_Hans_CN"><Text>Mac 原版调试输入启动器</Text></Row><Row Tag="LOC_C7NI_DESCRIPTION" Language="zh_Hans_CN"><Text>仅限 Mac。请打开此工坊条目的文件夹，双击其中的启动器。启用此条目不会自动加载原生输入修复。</Text></Row></LocalizedText>
</Database>
''')
files={}
for p in sorted(payload.rglob('*')):
    assert not p.is_symlink(),p
    if p.is_file():files[str(p.relative_to(payload))]={'size':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'mode':oct(stat.S_IMODE(p.stat().st_mode))}
(payload/'manifest.json').write_text(json.dumps({'version':VERSION,'files':files},ensure_ascii=False,indent=2)+'\n')
archive=OUT/f'civ7-native-debug-input-{VERSION}-macos-arm64.zip'
if archive.exists():raise SystemExit('Archive already exists; use a fresh output directory')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(payload.rglob('*')):
        z.write(p,Path(payload.name)/p.relative_to(payload))
receipt={'version':VERSION,'payload':str(payload),'app':str(app),'archive':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':files}
(OUT/'package.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:receipt[k] for k in ['payload','app','archive','sha256']},ensure_ascii=False))
