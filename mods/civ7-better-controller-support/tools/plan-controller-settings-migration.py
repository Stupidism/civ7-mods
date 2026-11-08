"""Read a verified *backup* SQLite database; output a plan, never write game data.

After installation, an authorized offline transaction may merge this namespace
into the exact shared SQLite row and remove only the hash-matched legacy row.
Require exactly one resulting row, then verify across live process restarts.
This planner never writes the database or reads through key-blind game APIs.
"""
from pathlib import Path
import argparse, hashlib, json, sqlite3

LEGACY = 'civ7-controller-bridge-v1'
NAMESPACE = 'civ7-map-tools-gamepad'
DEFAULTS = dict(enabled=False, swapSticks=False, invertLeftY=False, invertPanY=True, showDebug=False)

def plan(database):
    database = Path(database).resolve()
    live = (Path.home() / 'Library/Application Support/Civilization VII/LocalStorage.sqlite').resolve()
    if database == live:
        raise ValueError('Use a verified backup database, not the live game database')
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as connection:
        rows = list(connection.execute('SELECT value FROM "Values" WHERE id=? AND key=?', ('fs://game', LEGACY)))
    if len(rows) != 1:
        raise ValueError('Expected exactly one legacy controller row; do not guess from modSettings')
    raw = rows[0][0]
    value = json.loads(raw)
    if (not isinstance(value, dict) or not {'enabled', 'invertPanY'} <= value.keys()
            or not value.keys() <= DEFAULTS.keys() or any(type(v) is not bool for v in value.values())):
        raise ValueError('Legacy row does not match a recognized controller schema; retain original data')
    config = {**DEFAULTS, **value}
    return dict(version=1, sourceOrigin='fs://game', sourceKey=LEGACY,
                sourceValueSha256=hashlib.sha256(raw.encode('utf-8')).hexdigest(),
                targetKey='modSettings', targetNamespace=NAMESPACE,
                targetValue=dict(version=1, controller=config), config=config, applied=False,
                cleanup='Operator transaction: preserve shared document, insert namespace, remove only hash-matched legacy row; require exactly one row')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(plan(args.database), ensure_ascii=False, indent=2))
    except (ValueError, sqlite3.Error) as error:
        parser.exit(1, str(error) + '\n')
