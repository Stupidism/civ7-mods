# Civilization VII program-owned game lock

As of 2026-10-24 the scheduler is ordinary local Python, not a model heartbeat.
The state and existing grants remain in `~/Library/Application Support/Civ7AgentCoordinator/`.

## Operation

- `request --thread ID --purpose TEXT`: append once; if free and unpaused, grant FIFO. When this request receives its own grant immediately, return the owner/token directly without creating a chat notification. A grant to an older queued request still gets a wake-up.
- `assert`, `heartbeat`, `run`, `release`, `cancel`: existing session/token interface retained.
- `release --reason TEXT`: refuse while a guarded command runs, persist cleanup evidence, atomically grant the next owner, then deliver immediately.
- `tick`: one program pass; `serve`: singleton loop every two seconds, no model calls.
- `pause` / `resume --thread 01a160c7-46f5-7dd2-9f24-3dfc652b528e --reason TEXT`: explicit coordinator action only. Resume requires user authorization and confirmed cleanup, never a timer.

The enabled scheduler is recorded as `scheduler: program`. Initial migration uses `enable-program` and is allowed only with no owner, no queued requests and no guarded command. A missing state defaults to paused. Legacy manual grants remain for compatibility but normal agents must use request and wait.

## Delivery and failure behavior

Immediate grants are decided while holding both the command-use and state locks. Their
`notification` is null; no message is sent or falsely marked delivered. Repeating
`request` returns the same current token without creating another notice. If the CLI
response is lost, repeat `request` to recover it; ownership is never reassigned automatically.

Queued grants (release, resume, service tick, or an older waiter encountered by a new
request) retain a durable outbox. The short message contains the session/token and
points to `AGENTS.md`, `assert`, and `status.state.lastRelease`. Full cleanup evidence
stays in state rather than being copied into the chat. Pending legacy messages already
accepted by Codex cannot be recalled; stale tokens still fail assertion.

The transport is `/Users/sunmer/.local/bin/codex queue --thread ID --message TEXT`.
This queues a message in the original chat and does not use a second model to decide scheduling. The receiving model runs only to perform its already-authorized work or handle a genuine exception. No private app database or rollout is edited.

A successful CLI exit plus a queue acceptance receipt marks the durable notice delivered. A failed/unknown result preserves ownership and retries after 5 seconds, exponentially backing off to a maximum of 30 minutes. Do not manually reassign a failed recipient's lock. Outbox attempts, error, receipt and acknowledgement are retained in state.

The state mutex covers notification acceptance and acknowledgement so a release or pause cannot overtake a stale send. A CLI call has a 20-second timeout. Cross-process delivery is **at least once**, not exactly once: a crash between remote acceptance and local fsync may duplicate the same token. The recipient must assert current ownership before each game action; a token is not an expansion of the user's authorization.

After 60 minutes without heartbeat, the program sends one persistent reminder per ownership token. It never steals ownership, clears a queue request, resumes a paused queue or infers safety from a chat's idle/completed state. The holder must inspect its work, stop children, restore restrictions and check saves before releasing. Human judgement is limited to actual recovery, not scheduling.

## macOS service

LaunchAgent: `~/Library/LaunchAgents/com.sunmer.civ7-game-lock.plist`.
Install/update using `python3 scripts/install-game-lock-service.py`. The installer copies
only the scheduler to `~/Library/Application Support/Civ7AgentCoordinator/runtime/`,
verifies its SHA-256, and registers/restarts this LaunchAgent. This avoids having a
background process execute source from macOS's protected Documents directory. It never
copies game data or changes privacy permissions. After editing the source, reinstall
the runtime; the repository CLI and installed service must match.
The agent starts on login and restarts on process exit. Request/release also deliver synchronously, independent of the service timer. Logout, sleep or a machine shutdown stops local execution; persisted state survives and is checked after restart/wake.

Read-only checks:

```sh
python3 scripts/game-lock.py status
launchctl print gui/$(id -u)/com.sunmer.civ7-game-lock
cat "$HOME/Library/Application Support/Civ7AgentCoordinator/health.json"
```

Health is updated every pass. Service stdout/stderr are in the same coordinator directory. `health.json` errors describe failed scheduler passes; transport failures are recorded in `state.notification.lastError` (the pass itself may still be healthy). Never edit state by hand. Resolve the CLI/app connection and run `tick` to retry when due; do not mark an unaccepted notice delivered.

The former 30-minute model automation `7-2` is paused after service verification. The 06:00/18:00 Mod reports remain unchanged.

## Validation

Tests use temporary `CIV7_LOCK_DIR` directories and a fake CLI, never real game state or real queued agents:

```sh
python3 scripts/tests/game-lock.test.py
python3 scripts/tests/game-lock-program.test.py
```

Coverage includes silent immediate grants and idempotent requests, concise queued notices with complete cleanup evidence retained, FIFO/token authentication, concurrent requests, guarded-command exclusion, pause/resume, failed notification persistence and retry from a new process, no duplicate acknowledged sends, one stale reminder and no automatic takeover. The installed Codex CLI queue was separately checked with a harmless message to the dashboard itself.

The service is a cooperative lock, not an operating-system sandbox. It cannot verify arbitrary direct UI activity or prove cleanup from a free-form reason; all agents must obey AGENTS.md.
