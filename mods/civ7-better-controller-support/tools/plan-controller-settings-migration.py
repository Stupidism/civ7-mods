"""Plan or apply a controller migration on a verified *backup* SQLite database.

The default command is read-only. With --apply-hash HASH from a separately
reviewed plan, one SQLite transaction merges the controller namespace into the
exact shared row, preserves unrelated namespaces/rows, and removes only the
hash-matched legacy row. The tool refuses the live game database and never
reads through key-blind game APIs.
"""
from pathlib import Path
import argparse, hashlib, json, sqlite3

LEGACY = 'civ7-controller-bridge-v1'
NAMESPACE = 'civ7-map-tools-gamepad'
DEFAULTS = dict(enabled=False, swapSticks=False, invertLeftY=False, invertPanY=True, showDebug=False)
GAME_DIRECTORY = (Path.home() / 'Library/Application Support/Civilization VII').resolve()


def checked_database(database):
    database = Path(database).resolve()
    try:
        database.relative_to(GAME_DIRECTORY)
    except ValueError:
        return database
    raise ValueError('Use a verified backup outside the live Civilization VII storage directory, not the live game database')


def decode_legacy(raw):
    value = json.loads(raw)
    if (not isinstance(value, dict) or not {'enabled', 'invertPanY'} <= value.keys()
            or not value.keys() <= DEFAULTS.keys() or any(type(v) is not bool for v in value.values())):
        raise ValueError('Legacy row does not match a recognized controller schema; retain original data')
    return {**DEFAULTS, **value}


def find_rows(connection, key):
    return list(connection.execute('SELECT value FROM "Values" WHERE id=? AND key=?', ('fs://game', key)))


def all_rows(connection):
    return list(connection.execute('SELECT id,key,value FROM "Values" ORDER BY id,key'))


def plan(database):
    database = checked_database(database)
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as connection:
        rows = find_rows(connection, LEGACY)
    if len(rows) != 1:
        raise ValueError('Expected exactly one legacy controller row; do not guess from modSettings')
    raw = rows[0][0]
    config = decode_legacy(raw)
    return dict(version=1, sourceOrigin='fs://game', sourceKey=LEGACY,
                sourceValueSha256=hashlib.sha256(raw.encode('utf-8')).hexdigest(),
                targetKey='modSettings', targetNamespace=NAMESPACE,
                targetValue=dict(version=1, controller=config), config=config, applied=False,
                cleanup='Offline transaction: preserve unrelated rows/shared namespaces and remove only the hash-matched legacy row')


def apply(database, expected_hash):
    database = checked_database(database)
    raw = None
    with sqlite3.connect(database) as connection:
        connection.execute('BEGIN IMMEDIATE')
        original_rows = all_rows(connection)
        legacy_rows = find_rows(connection, LEGACY)
        if len(legacy_rows) != 1:
            raise ValueError('Expected exactly one legacy controller row inside the transaction')
        raw = legacy_rows[0][0]
        if hashlib.sha256(raw.encode('utf-8')).hexdigest() != expected_hash:
            raise ValueError('Legacy controller row hash changed; review the new backup plan')
        config = decode_legacy(raw)
        target_value = dict(version=1, controller=config)
        shared_rows = find_rows(connection, 'modSettings')
        if len(shared_rows) > 1:
            raise ValueError('Expected zero or one shared modSettings row for the exact origin/key')
        if shared_rows:
            try:
                shared = json.loads(shared_rows[0][0])
            except (TypeError, json.JSONDecodeError) as error:
                raise ValueError('Shared modSettings row is malformed; retain original data') from error
            if not isinstance(shared, dict) or NAMESPACE in shared:
                raise ValueError('Shared modSettings row collides with the controller namespace; retain original data')
            merged = {**shared, NAMESPACE: target_value}
        else:
            merged = {NAMESPACE: target_value}
        merged_raw = json.dumps(merged, ensure_ascii=False, separators=(',', ':'))
        expected_rows = [row for row in original_rows if not (row[0] == 'fs://game' and row[1] in {LEGACY, 'modSettings'})]
        expected_rows.append(('fs://game', 'modSettings', merged_raw))
        expected_rows.sort()
        if shared_rows:
            changed = connection.execute(
                'UPDATE "Values" SET value=? WHERE id=? AND key=? AND value=?',
                (merged_raw, 'fs://game', 'modSettings', shared_rows[0][0]),
            ).rowcount
            if changed != 1:
                raise ValueError('Shared modSettings row changed inside the transaction; retry from a new backup plan')
        else:
            connection.execute('INSERT INTO "Values"(id,key,value) VALUES(?,?,?)',
                               ('fs://game', 'modSettings', merged_raw))
        removed = connection.execute(
            'DELETE FROM "Values" WHERE id=? AND key=? AND value=?',
            ('fs://game', LEGACY, raw),
        ).rowcount
        if removed != 1:
            raise ValueError('Legacy controller row changed inside the transaction; retry from a new backup plan')

        # Verify the complete row set and exact target bytes inside the same
        # transaction. Any mismatch rolls back every change above.
        if all_rows(connection) != expected_rows:
            raise ValueError('Shared migration write failed verification; transaction rolled back')
        connection.commit()
        target = merged_raw

    # SQLite commit is the durability boundary. If a later read is impossible
    # to satisfy, report it rather than claiming a safe rollback.
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as connection:
        if all_rows(connection) != expected_rows:
            raise RuntimeError('Post-commit verification failed; retain the backup and investigate the database')
        target_hash = hashlib.sha256(target.encode('utf-8')).hexdigest()
        if hashlib.sha256(find_rows(connection, 'modSettings')[0][0].encode('utf-8')).hexdigest() != target_hash:
            raise RuntimeError('Post-commit verification failed; retain the backup and investigate the database')
    return dict(applied=True, sourceOrigin='fs://game', sourceKey=LEGACY,
                sourceValueSha256=hashlib.sha256(raw.encode('utf-8')).hexdigest(),
                targetKey='modSettings', targetNamespace=NAMESPACE,
                targetValueSha256=hashlib.sha256(target.encode('utf-8')).hexdigest())


def is_sha256(value):
    return isinstance(value, str) and len(value) == 64 and all(c in '0123456789abcdef' for c in value)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, type=Path)
    parser.add_argument('--apply-hash', type=str)
    args = parser.parse_args()
    try:
        if args.apply_hash is not None:
            expected_hash = args.apply_hash
            if not is_sha256(expected_hash):
                raise ValueError('Expected a 64-character lowercase SHA-256 value')
            result = apply(args.database, expected_hash)
        else:
            result = plan(args.database)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, RuntimeError, sqlite3.Error, json.JSONDecodeError) as error:
        parser.exit(1, str(error) + '\n')
