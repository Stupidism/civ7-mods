import concurrent.futures, json, os, pathlib, subprocess, tempfile, time, unittest
SCRIPT=str(pathlib.Path(__file__).resolve().parents[1]/'game-lock.py')
COORD='01a160c7-46f5-7dd2-9f24-3dfc652b528e'
class LockTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(); self.env=dict(os.environ,CIV7_LOCK_DIR=self.tmp.name)
 def tearDown(self): self.tmp.cleanup()
 def call(self,*args,ok=True):
  r=subprocess.run(['python3',SCRIPT,*args],env=self.env,capture_output=True,text=True)
  self.assertEqual(r.returncode,0 if ok else 2,r.stderr)
  return json.loads(r.stdout) if r.returncode==0 else r.stderr
 def ready(self): self.call('resume','--thread',COORD,'--reason','isolated test, no game')
 def request(self,name): return self.call('request','--thread',name,'--purpose','test')
 def grant(self): return self.call('grant','--thread',COORD)['result']
 def test_fifo_and_owner_validation(self):
  self.request('a');self.request('b');self.call('grant','--thread',COORD,ok=False)
  self.ready(); o=self.grant();self.assertEqual(o['thread'],'a')
  self.call('grant','--thread',COORD,ok=False)
  self.call('release','--thread','b','--token',o['token'],'--reason','done',ok=False)
  released=self.call('release','--thread','a','--token',o['token'],'--reason','done')
  self.assertEqual(released['result']['thread'],'b')
  notice=released['state']['notification']
  self.assertEqual(notice['thread'],'b'); self.assertIsNone(notice['deliveredAt'])
  self.call('mark-notified','--thread','a','--token',notice['id'])
  self.assertIsNotNone(self.call('status')['state']['notification']['deliveredAt'])
  self.call('assert','--thread','a','--token',o['token'],ok=False)
 def test_concurrent_requests_no_loss_duplicate(self):
  with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex: list(ex.map(self.request,[str(i%10) for i in range(30)]))
  self.assertEqual(len(self.call('status')['state']['queue']),10)
 def test_busy_command_blocks_release_and_overlap(self):
  self.ready(); self.request('a');o=self.grant(); auth=['--thread','a','--token',o['token']]
  marker=pathlib.Path(self.tmp.name)/'running'
  p=subprocess.Popen(['python3',SCRIPT,'run',*auth,'--','python3','-c',f"import pathlib,time;pathlib.Path({str(marker)!r}).touch();time.sleep(1)"],env=self.env)
  try:
   for _ in range(100):
    if marker.exists(): break
    time.sleep(.02)
   self.assertTrue(marker.exists())
   self.call('release',*auth,'--reason','done',ok=False)
   self.call('run',*auth,'--','true',ok=False)
  finally: p.wait(timeout=5)
  self.call('release',*auth,'--reason','done')
 def test_stale_owner_not_reclaimed_and_pause(self):
  self.ready();self.request('a');o=self.grant();self.request('b')
  path=pathlib.Path(self.tmp.name)/'state.json';s=json.loads(path.read_text());s['owner']['heartbeatAt']='2000-01-01T00:00:00+00:00';path.write_text(json.dumps(s))
  self.assertTrue(self.call('status')['needsCheck']);self.call('grant','--thread',COORD,ok=False)
  self.call('pause','--thread',COORD,'--reason','user stopped')
  self.call('assert','--thread','a','--token',o['token'],ok=False)
 def test_paused_release_does_not_grant(self):
  self.ready();self.request('a');o=self.grant();self.request('b')
  self.call('pause','--thread',COORD,'--reason','stop')
  s=self.call('release','--thread','a','--token',o['token'],'--reason','restored')['state']
  self.assertIsNone(s['owner']);self.assertEqual(s['queue'][0]['thread'],'b')
 def test_failed_notification_keeps_reserved_owner(self):
  self.ready();self.request('a');o=self.grant();self.request('b')
  self.call('release','--thread','a','--token',o['token'],'--reason','done')
  s=self.call('status')['state'];self.assertEqual(s['owner']['thread'],'b')
  self.assertIsNone(s['notification']['deliveredAt'])
  self.call('mark-notified','--thread','a','--token',o['token'],ok=False)
  self.call('grant','--thread',COORD,ok=False)
 def test_cancel_and_ungranted_run(self):
  self.request('a');self.request('a');self.call('cancel','--thread','a')
  self.assertEqual(self.call('status')['state']['queue'],[])
  self.call('run','--thread','a','--token','fake','--','true',ok=False)
if __name__=='__main__': unittest.main()
