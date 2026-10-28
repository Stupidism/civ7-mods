#!/usr/bin/env python3
"""Cooperative, host-wide Civ7 UI queue. Never reclaim a stale owner automatically."""
import argparse, contextlib, datetime, fcntl, json, os, pathlib, subprocess, sys, uuid, signal, time
COORDINATOR = '01a160c7-46f5-7dd2-9f24-3dfc652b528e'
ROOT = pathlib.Path(os.environ.get('CIV7_LOCK_DIR', pathlib.Path.home() / 'Library/Application Support/Civ7AgentCoordinator'))
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def program(s): return s.get('scheduler') == 'program'
@contextlib.contextmanager
def mutex(name, nonblocking=False):
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (ROOT / name).open('a+') as f:
        try: fcntl.flock(f, fcntl.LOCK_EX | (fcntl.LOCK_NB if nonblocking else 0))
        except BlockingIOError: raise ValueError('A guarded command is still running; cannot release or overlap it')
        try: yield
        finally: fcntl.flock(f, fcntl.LOCK_UN)
def read():
    p = ROOT / 'state.json'
    return json.loads(p.read_text()) if p.exists() else {'version':1,'paused':True,'reason':'Initial handover: coordinator must confirm previous users stopped','owner':None,'queue':[],'events':[]}
def save(s, action):
    s['events'].append({'at':now(),'action':action})
    p=ROOT / ('state.'+str(uuid.uuid4())+'.tmp')
    with p.open('w') as f:
        os.chmod(p, 0o600)
        json.dump(s,f,ensure_ascii=False,indent=2); f.flush(); os.fsync(f.fileno())
    os.replace(p,ROOT/'state.json')
def grant_prompt(owner):
    return f"游戏锁已轮到本会话。CIV7_SESSION_ID={owner['thread']}；CIV7_GAME_LOCK_TOKEN={owner['token']}。按仓库 AGENTS.md 执行，操作前先 assert；上位收尾见 status 的 lastRelease。仅继续已授权工作，过期通知忽略，无需回复或转发。"

def assign_next(s, sender, direct_thread=None):
    if s['paused'] or s['owner'] or not s['queue']: return None
    owner={**s['queue'].pop(0),'token':str(uuid.uuid4()),'grantedAt':now(),'heartbeatAt':now()}
    s['owner']=owner
    # Only the caller that receives this grant directly can skip a wake-up.
    # Keep this decision in the same state transaction as assigning ownership:
    # the service must never see an intermediate outbox and send a duplicate.
    s['notification']=None
    if owner['thread'] != direct_thread:
        s['notification']={'id':owner['token'],'thread':owner['thread'],'sender':sender,'createdAt':now(),'deliveredAt':None,
            'prompt':grant_prompt(owner)}
    return owner

def auth(s,a):
    o=s['owner']
    if not o or o['thread'] != a.thread or o['token'] != a.token: raise ValueError('No matching granted ownership; request and wait for coordinator')
    return o
def coordinator(a):
    if a.thread != COORDINATOR: raise ValueError('Only the dashboard coordinator may grant/resume/pause')

def dispatch():
    """Persistent at-least-once delivery. Never hand a failed recipient's lock elsewhere.

    Hold state.lock across queue acceptance and acknowledgement so release/pause cannot
    race a stale grant notice. No model decides what to send. A crash after acceptance
    but before fsync can duplicate a notice; its token still makes stale actions fail.
    """
    with mutex('delivery.lock', True), mutex('state.lock'):
        s=read()
        if not program(s) or s['paused'] or not s['owner']: return
        o=s['owner']; pending=[]
        n=s.get('notification')
        if n and n['id']==o['token'] and n['thread']==o['thread'] and not n.get('deliveredAt'):
            n['prompt']=grant_prompt(o)  # Shorten any unsent legacy grant on retry too.
            pending.append(n)
        alert=s.get('staleAlert')
        if alert and alert['id']==o['token'] and not alert.get('deliveredAt'):
            pending.append(alert)
        for n in pending:
            if n.get('nextRetryEpoch',0)>time.time(): continue
            n['attempts']=n.get('attempts',0)+1
            n['lastAttemptAt']=now()
            # Resolve an explicit installed CLI; never invoke a shell or another agent.
            cli=os.environ.get('CIV7_CODEX_BIN',str(pathlib.Path.home()/'.local/bin/codex'))
            try:
                r=subprocess.run([cli,'queue','--thread',n['thread'],'--message',n['prompt']],
                                 capture_output=True,text=True,timeout=20)
                if r.returncode or 'Queued message ' not in r.stdout:
                    raise OSError((r.stderr or r.stdout or 'No queue acceptance receipt')[-1200:])
                n['deliveredAt']=now()
                n['receipt']=r.stdout.strip()[-1200:]
                n.pop('lastError',None); n.pop('nextRetryEpoch',None)
            except (OSError,subprocess.TimeoutExpired) as e:
                n['lastError']=str(e)[:1200]
                n['nextRetryEpoch']=time.time()+min(1800,5*2**min(n['attempts']-1,9))
            save(s,'program notification '+('accepted' if n.get('deliveredAt') else 'retry pending'))

def tick():
    with mutex('state.lock'):
        s=read()
        if not program(s): return
        o=s.get('owner')
        if o and not s['paused']:
            age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(o['heartbeatAt'])).total_seconds()
            if age>3600 and (s.get('staleAlert') or {}).get('id')!=o['token']:
                s['staleAlert']={'id':o['token'],'thread':o['thread'],'createdAt':now(),'deliveredAt':None,
                    'prompt':f"游戏锁程序提醒：本会话的锁 {o['token']} 超过60分钟未续心跳，锁仍归你，未转交。若仍在授权工作请heartbeat；若工作结束或取消，请先停止并等待全部游戏子进程、恢复Rest Guard/安装探针、核验存档，再用本会话token自行release并记录收尾证据。不要启动新测试。相同持锁周期仅提醒一次。"}
                save(s,'program stale-owner alert created')
    # An orphaned running command must prevent even an initially-free grant.
    try:
        with mutex('use.lock',True), mutex('state.lock'):
            s=read()
            if program(s) and assign_next(s,COORDINATOR): save(s,'program FIFO grant')
    except ValueError: pass  # A normal guarded command is active; no takeover.
    dispatch()

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('action',choices=['status','request','grant','assert','heartbeat','release','cancel','pause','resume','run','mark-notified','enable-program','tick','serve'])
    p.add_argument('--thread',default=os.environ.get('CIV7_SESSION_ID'))
    p.add_argument('--token',default=os.environ.get('CIV7_GAME_LOCK_TOKEN'))
    p.add_argument('--purpose',default='')
    p.add_argument('--reason',default='')
    a,command=p.parse_known_args()
    if a.action != 'run' and command: p.error('Unexpected arguments')
    if a.action in ['tick','serve']:
        if a.action=='tick': tick(); return 0
        with mutex('daemon.lock',True):
            while True:
                try:
                    tick()
                    health={'checkedAt':now(),'error':None}
                except (ValueError,OSError,json.JSONDecodeError) as e:
                    health={'checkedAt':now(),'error':str(e)}
                tmp=ROOT/'health.tmp'; tmp.write_text(json.dumps(health)); os.replace(tmp,ROOT/'health.json')
                time.sleep(2)
    if a.action != 'status' and not a.thread: p.error('--thread or CIV7_SESSION_ID required')
    if a.action=='run':
        if command[:1]==['--']: command=command[1:]
        if not command: p.error('run requires -- command [args]')
        with mutex('use.lock', True):
            with mutex('state.lock'):
                s=read(); o=auth(s,a)
                if s['paused']: raise ValueError('Coordinator paused game interaction')
                o['heartbeatAt']=now(); save(s,'run '+a.thread)
            env=dict(os.environ,CIV7_SESSION_ID=a.thread,CIV7_GAME_LOCK_TOKEN=a.token,CIV7_GAME_LOCK_GUARDED='1')
            child = subprocess.Popen(command, env=env, start_new_session=True)
            previous = {}
            def forward(sig, frame):
                try: os.killpg(child.pid, sig)
                except ProcessLookupError: pass
            for sig in (signal.SIGINT, signal.SIGTERM):
                previous[sig] = signal.signal(sig, forward)
            try: return child.wait()
            finally:
                for sig, handler in previous.items(): signal.signal(sig, handler)
    # release/resume cannot race a running guarded command.
    with contextlib.ExitStack() as stack:
        request_can_grant=False
        if a.action=='request':
            try:
                stack.enter_context(mutex('use.lock',True))
                request_can_grant=True
            except ValueError: pass  # Enqueue normally while a guarded command is active.
        if a.action in ['release','resume','grant','enable-program']: stack.enter_context(mutex('use.lock',True))
        stack.enter_context(mutex('state.lock'))
        s=read(); result=None
        if a.action=='request':
            if not a.purpose: raise ValueError('--purpose required')
            if s['owner'] and s['owner']['thread']==a.thread: result=s['owner']
            elif not any(q['thread']==a.thread for q in s['queue']): s['queue'].append({'thread':a.thread,'purpose':a.purpose,'requestedAt':now()})
            if program(s) and request_can_grant:
                granted=assign_next(s,COORDINATOR,direct_thread=a.thread)
                if granted and granted['thread']==a.thread: result=granted
        elif a.action=='enable-program':
            coordinator(a)
            if s['owner'] or s['queue']: raise ValueError('Enable program mode only during an empty, idle handover')
            s['scheduler']='program'
        elif a.action=='grant':
            coordinator(a)
            if s['paused']: raise ValueError('Paused: confirm prior users stopped before resume')
            if s['owner']: raise ValueError('Already owned; no automatic takeover')
            result=assign_next(s,a.thread)
        elif a.action in ['assert','heartbeat']:
            result=auth(s,a)
            if s['paused']: raise ValueError('Coordinator paused game interaction')
            if a.action=='heartbeat': result['heartbeatAt']=now()
        elif a.action=='release':
            auth(s,a)
            if not a.reason: raise ValueError('--reason must confirm stopped commands and restored prior state')
            s['lastRelease']={'thread':a.thread,'at':now(),'reason':a.reason}
            s['owner']=None
            s['notification']=None
            s.pop('staleAlert',None)
            result=assign_next(s,a.thread)
        elif a.action=='mark-notified':
            n=s.get('notification')
            if not n or not s['owner'] or n['id']!=s['owner']['token'] or n['id']!=a.token or a.thread not in [COORDINATOR,n['sender']]:
                raise ValueError('Notification does not match current handoff')
            n['deliveredAt']=n['deliveredAt'] or now()
        elif a.action=='cancel': s['queue']=[q for q in s['queue'] if q['thread']!=a.thread]
        elif a.action in ['pause','resume']:
            coordinator(a)
            if not a.reason: raise ValueError('--reason required')
            s['paused']=a.action=='pause'; s['reason']=a.reason
        if a.action not in ['assert','status']: save(s,a.action+' '+str(a.thread)+' '+a.reason)
        out={'result':result,'state':s}
        if s['owner']:
            age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(s['owner']['heartbeatAt'])).total_seconds()
            out['ownerHeartbeatAgeSeconds']=int(age); out['needsCheck']=age>3600
    if a.action in ['request','release','resume'] and program(s):
        try:
            if a.action=='request': dispatch()  # Assignment was atomic with the request above.
            else: tick()
        except (ValueError,OSError) as e: print('Program delivery deferred: '+str(e),file=sys.stderr)
        with mutex('state.lock'):
            s=read(); out['state']=s
            # A queued request stays queued in its response even if the service
            # grants it concurrently; that separate grant carries its own wake-up.
    print(json.dumps(out,ensure_ascii=False,indent=2))
    return 0
if __name__=='__main__':
    try: sys.exit(main())
    except (ValueError,OSError,json.JSONDecodeError) as e: print(str(e),file=sys.stderr); sys.exit(2)
