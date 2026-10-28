"""Isolated scheduler integration tests: never touches real locks, Codex or the game."""
import concurrent.futures
import fcntl
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

SCRIPT = str(pathlib.Path(__file__).resolve().parents[1] / 'game-lock.py')
COORD = '01a160c7-46f5-7dd2-9f24-3dfc652b528e'


class ProgramTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        cli = self.root / 'codex-stub'
        cli.write_text('#!' + sys.executable + '\n' + '''
import json, pathlib, sys
root=pathlib.Path(__file__).parent
if (root/'fail').exists(): sys.exit(1)
with (root/'sent.jsonl').open('a') as f: f.write(json.dumps(sys.argv[1:])+'\\n')
print('Queued message test-receipt')
''')
        cli.chmod(0o700)
        self.env = dict(os.environ, CIV7_LOCK_DIR=str(self.root), CIV7_CODEX_BIN=str(cli))
        self.call('enable-program', '--thread', COORD)
        self.call('resume', '--thread', COORD, '--reason', 'isolated test only')

    def tearDown(self):
        self.tmp.cleanup()

    def call(self, *args, ok=True):
        r = subprocess.run([sys.executable, SCRIPT, *args], env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0 if ok else 2, r.stderr)
        return json.loads(r.stdout) if r.stdout.strip() else None

    def state(self):
        return self.call('status')['state']

    def sent(self):
        p = self.root / 'sent.jsonl'
        return [json.loads(x) for x in p.read_text().splitlines()] if p.exists() else []

    def request(self, thread):
        return self.call('request', '--thread', thread, '--purpose', 'isolated test')

    def release(self, owner):
        return self.call('release', '--thread', owner['thread'], '--token', owner['token'], '--reason', 'commands stopped, prior state restored; isolated test')

    def edit_fixture(self, change):
        # Test fixtures only. Production state changes always go through the CLI.
        s = self.state(); change(s)
        (self.root / 'state.json').write_text(json.dumps(s))

    def test_request_release_immediate_fifo_without_dashboard(self):
        a = self.request('a')['result']
        self.request('b'); self.request('c')
        self.assertEqual(len(self.sent()), 0)
        b = self.release(a)['state']['owner']
        self.assertEqual(b['thread'], 'b')
        self.assertEqual(self.sent()[-1][2], 'b')
        self.assertIsNotNone(self.state()['notification']['deliveredAt'])
        self.call('tick'); self.call('tick')
        self.assertEqual(len(self.sent()), 1)
        self.call('assert', '--thread', 'a', '--token', a['token'], ok=False)
        self.assertEqual(self.release(b)['state']['owner']['thread'], 'c')

    def test_failed_send_restart_retry_preserves_owner_and_token(self):
        (self.root / 'fail').touch()
        a = self.request('a')['result']; self.request('b')
        b = self.release(a)['state']['owner']
        self.assertEqual(self.state()['owner']['token'], b['token'])
        self.assertIsNone(self.state()['notification']['deliveredAt'])
        self.assertEqual(self.state()['notification']['attempts'], 1)
        (self.root / 'fail').unlink()
        self.edit_fixture(lambda s: s['notification'].update(nextRetryEpoch=0))
        self.call('tick')  # Fresh process reads persisted retry after restart.
        self.assertEqual(self.state()['owner']['token'], b['token'])
        self.assertEqual(len(self.sent()), 1)

    def test_paused_release_keeps_queue_and_resume_delivers(self):
        a = self.request('a')['result']; self.request('b')
        self.call('pause', '--thread', COORD, '--reason', 'user stop')
        self.release(a); self.call('tick')
        self.assertIsNone(self.state()['owner'])
        self.assertEqual(self.state()['queue'][0]['thread'], 'b')
        self.assertEqual(len(self.sent()), 0)
        self.call('resume', '--thread', COORD, '--reason', 'user authorized resume')
        self.assertEqual(self.state()['owner']['thread'], 'b')

    def test_stale_reminder_once_never_steals(self):
        a = self.request('a')['result']; self.request('b')
        self.edit_fixture(lambda s: s['owner'].update(heartbeatAt='2000-01-01T00:00:00+00:00'))
        self.call('tick'); self.call('tick')
        self.assertEqual(len(self.sent()), 1)
        self.assertEqual(self.state()['owner']['token'], a['token'])
        self.assertEqual(self.state()['queue'][0]['thread'], 'b')

    def test_concurrent_requests_single_owner_no_lost_queue(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(self.request, [str(i % 8) for i in range(24)]))
        self.call('tick')
        s = self.state()
        self.assertEqual(len({s['owner']['thread']} | {q['thread'] for q in s['queue']}), 8)
        self.assertEqual(len(s['queue']), 7)
        self.assertEqual(len(self.sent()), 0)

    def test_pending_notice_not_sent_while_paused(self):
        a = self.request('a')['result']; self.request('b')
        (self.root / 'fail').touch(); self.release(a)
        (self.root / 'fail').unlink()
        self.edit_fixture(lambda s: s['notification'].update(nextRetryEpoch=0))
        self.call('pause', '--thread', COORD, '--reason', 'user stop'); self.call('tick')
        self.assertEqual(self.sent(), [])
        self.assertIsNone(self.state()['notification']['deliveredAt'])

    def test_immediate_grant_and_repeated_request_never_notify(self):
        (self.root / 'fail').touch()  # Direct return does not need the transport.
        a = self.request('a')['result']
        self.assertEqual(self.request('a')['result']['token'], a['token'])
        self.assertIsNone(self.state().get('notification'))
        (self.root / 'fail').unlink()
        self.call('tick'); self.call('tick')
        self.assertEqual(self.sent(), [])
        self.call('assert', '--thread', 'a', '--token', a['token'])

    def test_queued_notice_is_short_and_preserves_cleanup_in_state(self):
        a = self.request('a')['result']; self.request('b')
        reason = 'cleanup evidence ' * 500
        s = self.call('release', '--thread', 'a', '--token', a['token'], '--reason', reason)['state']
        message = self.sent()[0][-1]
        self.assertLess(len(message), 350)
        self.assertIn(s['owner']['token'], message)
        self.assertIn('CIV7_SESSION_ID=b', message)
        self.assertIn('assert', message)
        self.assertIn('AGENTS.md', message)
        self.assertIn('lastRelease', message)
        self.assertNotIn(reason, message)
        self.assertEqual(s['lastRelease']['reason'], reason)
        self.request('b'); self.call('tick')
        self.assertEqual(len(self.sent()), 1)

    def test_request_does_not_suppress_notice_for_older_waiter(self):
        with (self.root / 'use.lock').open('a+') as busy:
            fcntl.flock(busy, fcntl.LOCK_EX)
            self.request('older')
        result = self.request('newer')
        self.assertIsNone(result['result'])
        self.assertEqual(result['state']['owner']['thread'], 'older')
        self.assertEqual(self.sent()[0][2], 'older')
        self.assertEqual(result['state']['queue'][0]['thread'], 'newer')

    def test_paused_request_is_not_granted_until_resume_then_notifies(self):
        self.call('pause', '--thread', COORD, '--reason', 'test')
        self.assertIsNone(self.request('a')['result'])
        self.assertEqual(self.sent(), [])
        self.call('resume', '--thread', COORD, '--reason', 'test authorized')
        self.assertEqual(len(self.sent()), 1)

    def test_unsent_legacy_grant_is_shortened_on_retry(self):
        a = self.request('a')['result']; self.request('b')
        (self.root / 'fail').touch(); b = self.release(a)['state']['owner']
        self.edit_fixture(lambda s: s['notification'].update(prompt='old long cleanup ' * 500, nextRetryEpoch=0))
        (self.root / 'fail').unlink(); self.call('tick')
        self.assertEqual(self.state()['owner']['token'], b['token'])
        self.assertLess(len(self.sent()[0][-1]), 350)
        self.assertIn(b['token'], self.sent()[0][-1])

    def test_release_before_retry_discards_stale_notice(self):
        a = self.request('a')['result']; self.request('b'); self.request('c')
        (self.root / 'fail').touch(); b = self.release(a)['state']['owner']
        (self.root / 'fail').unlink(); c = self.release(b)['state']['owner']
        self.call('tick')
        self.assertEqual([message[2] for message in self.sent()], ['c'])
        self.assertIn(c['token'], self.sent()[0][-1])
        self.assertNotIn(b['token'], self.sent()[0][-1])

    def test_service_racing_requests_keeps_fifo_and_one_owner(self):
        def contending_tick():
            r = subprocess.run([sys.executable, SCRIPT, 'tick'], env=self.env, capture_output=True, text=True)
            # Concurrent dispatch is deliberately non-blocking. The real serve
            # loop catches this deferral and retries on its next pass.
            self.assertIn(r.returncode, [0, 2], r.stderr)
            if r.returncode == 2:
                self.assertIn('cannot release or overlap it', r.stderr)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            jobs = [pool.submit(self.request, str(i)) for i in range(8)]
            ticks = [pool.submit(contending_tick) for _ in range(8)]
            results = [job.result() for job in jobs]
            for job in ticks: job.result()
        self.call('tick')  # Final uncontended pass must deliver any queued notice.
        s = self.state(); owner = s['owner']
        self.assertEqual(len({owner['thread']} | {q['thread'] for q in s['queue']}), 8)
        self.assertEqual(len(s['queue']), 7)
        self.assertLessEqual(len(self.sent()), 1)
        if s['notification'] is None: self.assertEqual(self.sent(), [])
        else: self.assertEqual(self.sent()[0][2], owner['thread'])
        expected = [q['thread'] for q in s['queue']]
        for thread in expected:
            owner = self.release(owner)['state']['owner']
            self.assertEqual(owner['thread'], thread)

    def test_busy_use_lock_prevents_initial_grant(self):
        with (self.root / 'use.lock').open('a+') as busy:
            fcntl.flock(busy, fcntl.LOCK_EX)
            self.request('a')
            self.assertIsNone(self.state()['owner'])
            self.assertEqual(self.sent(), [])
        self.call('tick')
        self.assertEqual(self.state()['owner']['thread'], 'a')


if __name__ == '__main__':
    unittest.main()
