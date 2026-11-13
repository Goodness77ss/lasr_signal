# Mode selection and round quit

3 November 2026. The home route now opens a game mode selection screen. Three distinct Play cards launch Endless Front, Classic Relay and Station Survival. Each card describes its objective. Explicit mode URLs are `/?mode=endless&play=1`, `/?mode=classic&play=1` and `/?mode=survival&play=1`. Direct `/survival.html` remains supported. The Armory and private multiplayer remain accessible.

## Quit policy

Operations includes Quit Round in these three practice modes. An active round requires confirmation that all its unclaimed rewards and recovered loot will be lost. Cancel retains the round. Opening Operations pauses local and server practice. Switching to another Operations destination during an active round uses the same warning and forfeiture, rather than bypassing it.

Local Endless and Classic discard their round credits and loot. Station Survival submits an authenticated surrender command and waits for the server to commit it before navigation. If the connection fails or the request times out, the page does not claim that quitting succeeded. Quitting works while paused and during deployment countdown.

For Survival, mission resolution happens first. Unspent round earnings are then recorded separately as `forfeitedWhole`, leaving available funds and terminal simulated bank credit at zero. New unextracted loot is lost. The original reward and mission records stay in the database, including reward cap history; quitting cannot reset a rolling allowance. Replayed quit commands return the recorded acknowledgement without charging twice. Restored terminal checkpoints retain the forfeiture. Older saved checkpoints without the optional forfeiture field retain their previous meaning.

Previously owned NFTs, previously claimed funds and wallet deposits are not erased. The practice forfeiture helper rejects an economy with a wallet deposit. Funded Survival and legacy escrow retain their existing contract settlement and refund rules. This revision does not change those deployed contracts or add this practice policy to funded custody. Death and connection timeout policies are unchanged.

## Verification and assets

Production build and TypeScript pass. The isolated application suite passes all 188 checks across 24 files, including real server tests for quitting an earned paused run, duplicate requests, restart recovery and zero remaining credit. Unit checks run with an absent public testnet manifest and two workers to avoid protected wallet startup during local tests. No public wallet transaction was submitted.

Browser review covers the three mode launches, quit confirmation, Cancel retaining the current round, confirmed quit returning home and guarded mode switching. Screenshots are stored under docs/evidence/mode-select and mode-quit names. Existing original generated bunker artwork and Barlow fonts are reused. The three vector mode icons are original code. No new downloaded asset or package was introduced.

## Launch

Use `npm run server` with `SURVIVAL_STATIONS_V2=true` and the existing database. Use `npm run dev -w @last-signal/web -- --port 5174` for the frontend. Home: http://127.0.0.1:5174/. The database and uncommitted work were retained.

Actual browser forfeiture proof: the review run earned 5 simulated station units, then Operations Quit committed SURRENDER with forfeitedWhole 5, terminal bank credit 0 and locked stake 0 before returning to mode selection. Evidence: docs/evidence/mode-quit-server-proof.json. Desktop and 390 pixel phone layouts were reviewed; the phone content fits without horizontal overflow. Cancel retained the round, and switching modes required the same confirmation.
