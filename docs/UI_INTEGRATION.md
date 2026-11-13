# Shared game interface

3 November 2026. Survival now uses the original LAST SIGNAL game shell instead of its separate utility page. The existing battlefield, briefing, palette, health and ammunition HUD, minimap, settings, supplies presentation and original procedural world are reused. The original markup was extracted into game-shell.ts and remains shared with main.ts; the original local gameplay implementation was retained.

The original home briefing includes Station Survival. The common Operations selector links original local modes, server station survival, private multiplayer, the original armory, weapon collections, testnet survival and wallet recovery. Side pages share navigation; this does not claim that their distinct wallet forms or funded gameplay renderer were completely rewritten.

Station Survival opens through /?mode=survival. Existing /survival.html links remain supported and load the same shell through startup.ts. Server controls, rule hashes, endpoints, economic authority and the last-signal-station-practice reconnect credential remain unchanged. No server, contract, deployment, wallet permission or token transaction was changed for this interface work.

The survival adapter maps the familiar controls to the existing server. Supplies and ledger use dialogs rather than permanently occupying the page. Supply review pauses active practice; closing it does not silently resume. Extraction remains an explicit bank action. Mission decisions remain explicit. Settings reuse last-signal-settings for effects, reduced motion and audio. Original synthesized gun and rain sounds are reused. In command view, movement uses the minimap, station buttons or ground orders. Eye level supports mouse capture and the original free mouse fallback, plus touch dragging. R, G, H, X, V, P and the tactical overlay retain their expected purposes. Hidden page handling pauses active practice while server wall deadlines continue.

Disconnected sessions reveal their reconnect briefing and disable stale combat controls. New runs close old dialogs, and completed runs use the original result and redeploy presentation. Previously saved sessions are not reset to create this interface.

## Verified

The browser deployed a real local server practice session through the shared briefing. One shot reduced loaded ammunition from twenty to nineteen. One basic supply order increased reserve ammunition from eighty to one hundred and reduced field credits from twenty to fifteen; simulated run funds remained zero. Opening supply review paused the server session.

Operations navigation opened the original home, launched the original Endless Front, then returned to Station Survival. Reconnect restored nineteen loaded rounds, one hundred reserve rounds, fifteen field credits and the same sixteen active seconds. Extraction controls were inspected in their dialog. This is actual local browser and server evidence, not public multiplayer or chain proof.

The responsive browser review used 390 by 844 CSS pixels with no horizontal overflow. The station row ended at 261 pixels and the health panel began at 270 pixels, avoiding the overlap found during review. This is a viewport review, not physical phone acceptance or a new performance benchmark. Embedded browser pointer capture remains browser dependent; the fallback remains available. Human playtesting is still required.

The application suite passed 173 cases across twenty one files. Strict TypeScript production build and the dedicated secret scan passed. The first test discovery also found an archived source copy under private runtime and ran those cases twice. vitest.config.ts now excludes private runtime snapshots so the reported application count remains 173. No dependency was added or migrated.

Current evidence is ui-integration-phone.png, ui-integration-desktop.png and ui-integration-briefing.png in docs/evidence, with the structured browser check in ui-integration-review.json. These captures show the actual rendered interface. Prior submission archives remain earlier snapshots and were not overwritten by this continuation.

## Local launch

From the repository, keep one service and one frontend running:

```powershell
$env:SURVIVAL_STATIONS_V2='true'
$env:SURVIVAL_VAULT_V2='false'
npm run server
```

In another terminal:

```powershell
$env:LAST_SIGNAL_SERVICE_ORIGIN='http://127.0.0.1:3001'
npm run dev -w @last-signal/web -- --port 5174 --strictPort
```

Original setup: http://127.0.0.1:5174/ . Integrated Survival: http://127.0.0.1:5174/?mode=survival . Existing Survival address: http://127.0.0.1:5174/survival.html . These are local practice URLs with simulated rewards, not funded public hosting.
