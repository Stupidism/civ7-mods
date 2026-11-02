#!/usr/bin/env python3
"""Install only the lock scheduler runtime in Application Support (no game files)."""
import hashlib
import os
import pathlib
import plistlib
import subprocess
import sys

ROOT = pathlib.Path.home() / 'Library/Application Support/Civ7AgentCoordinator'
LABEL = 'com.sunmer.civ7-game-lock'
SOURCE = pathlib.Path(__file__).with_name('game-lock.py')
PLIST = pathlib.Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')


def main():
    if sys.platform != 'darwin':
        raise SystemExit('This installer is for macOS launchd only')
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    runtime = ROOT / 'runtime'
    runtime.mkdir(exist_ok=True, mode=0o700)
    target = runtime / 'game-lock.py'
    data = SOURCE.read_bytes()
    tmp = target.with_suffix('.tmp')
    tmp.write_bytes(data); tmp.chmod(0o700)
    os.replace(tmp, target)
    assert hashlib.sha256(target.read_bytes()).digest() == hashlib.sha256(data).digest()
    domain = 'gui/' + str(os.getuid())
    # Stop only our scheduler, never the game or any Codex service.
    check = subprocess.run(['launchctl', 'print', domain + '/' + LABEL], capture_output=True)
    if check.returncode == 0:
        subprocess.run(['launchctl', 'bootout', domain + '/' + LABEL], check=True)
    spec = {
        'Label': LABEL, 'ProgramArguments': [sys.executable, str(target), 'serve'],
        'WorkingDirectory': str(ROOT), 'RunAtLoad': True, 'KeepAlive': True,
        'ThrottleInterval': 10,
        'EnvironmentVariables': {
            'CIV7_CODEX_BIN': str(pathlib.Path.home() / '.local/bin/codex'),
            'PATH': str(pathlib.Path.home() / '.local/bin') + ':/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
        },
        'StandardOutPath': str(ROOT / 'service.stdout.log'),
        'StandardErrorPath': str(ROOT / 'service.stderr.log'),
    }
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    PLIST.write_bytes(plistlib.dumps(spec)); PLIST.chmod(0o644)
    subprocess.run(['launchctl', 'bootstrap', domain, str(PLIST)], check=True)
    print('Installed scheduler runtime SHA256:', hashlib.sha256(data).hexdigest())
    print('LaunchAgent:', PLIST)


if __name__ == '__main__':
    main()
