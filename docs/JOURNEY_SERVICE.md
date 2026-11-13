# Journey transport and durable practice service

Steps 08 and 09 verified for local server practice. The original browser route remains local simulation until its later network adapter is completed. Do not confuse it with this service proof.

The separate `/journey` socket validates exact protocol, rules and generator identifiers. Client packets remain 2048 bytes; snapshots have a separate 65536 byte budget. Origin, connection queue, packet category, run ownership, leader control, current section and monotonic sequence checks precede mutation. Hidden enemies, internal events, private routes and enemy spawn records are omitted from observations. A shared session credential is authority to that practice run, not wallet ownership.

The service uses separate additive SQLite tables for runs, commands, events and migration versions. Credentials are hashed in storage. State, revision, sequence and command acknowledgement commit together before success is sent. Reusing a command ID with a different payload fails. Integer ticks persist before observation publication. Pause persists, disconnect stops simulation and preserves ACTIVE, and service shutdown does not submit quit. No offline reward or funded timeout is implied.

Recovery validates snapshot integrity, actor identities, capacity, inventory, movement, timers, event bounds, terminal accounting, full pinned rules hash and deterministic section identity. Unknown or corrupted records fail instead of being upgraded silently.

## Actual evidence

`journey-protocol`, `journey-boundary`, `journey-routes`, `journey-store`, `journey-service`, `journey-state`, `journey-app`, `journey-application-socket` and `journey-crash` test files cover the boundary and recovery. Actual loopback sockets prove accepted dispatch, rejected packet fields, binary rejection, fire flooding, changed replay, actor denial and resumed committed state. A real child process exits after a shot commits but before acknowledgement; reopening the WAL database and retrying preserves one command and nineteen rounds. Injected SQLite update rejection proves no acknowledgement and no debit, followed by one successful retry. This is a storage rejection test, not a physical disk exhaustion test.

Production build passed. Full application run: 226 passed and four default timeout failures. Targeted rerun of those four files: twenty passed, one worker, thirty second functional deadline. No assertion was removed. These checks establish local service behaviour, not human playtest, public multiplayer, chain integration or frame rate.

## Local launch

Use a dedicated disposable or private runtime database when evaluating the new service. In PowerShell from the repository root:

```powershell
$env:JOURNEY_ENABLED='true'
$env:PORT='3002'
$env:DATABASE_PATH=Join-Path (Get-Location) '.runtime/journey-service.sqlite'
$env:ALLOWED_ORIGINS='http://127.0.0.1:5180,http://127.0.0.1:5174'
npm run server
```

Capabilities are at `http://127.0.0.1:3002/journey/config`; the socket is `ws://127.0.0.1:3002/journey`. Existing API proxy infrastructure supports the separate route when configured to this service. The current browser Journey page still runs its own local simulation. Default launches keep the service disabled. No public manifest, contract address or wallet flow was changed.
