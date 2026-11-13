# Solid field and human scale

3 November 2026. Existing code and uncommitted work retained.

Buildings, sandbags, crates, home tables, flag poles, station radio tables and aerial supports, station frames and drums, and wrecks now have authored solid footprints. Walking uses a body radius rather than a point. Direct movement slides along obstacles. Route movement uses bounded substeps and navigation checks the spaces between grid nodes, so a path cannot cut through a thin prop. Repeated static route edges are cached. Older saved positions that overlap newly solid scenery are moved to nearby clear ground.

The shared simulation exports FIELD_SOLIDS, walkable, bodyStep and ACTOR. Player movement, bot routes, rifle obstruction and camera avoidance use these shapes. Low cover blocks movement while a shot above its height can pass. Building shells remain closed solids, without enterable interiors. Grass, puddles, flat ground planks and distant scenery are not walls. Decorative companions remain a visual representation of the authoritative squad; their offsets are checked against the solid field.

Characters render at 1.1 times their previous size, approximately two metres tall. Eye height is 1.8 metres. The field expands by 1.5 horizontally, making its rendered dimensions 72 by 48 world metres. Its logical 48 by 32 layout, station positions and routes remain the same. This is a physical presentation scale change, not additional playable sectors. Camera targets, picking, screen labels, shot directions and static batching account for the scale. Rendering and simulation coordinates are deliberately converted at their boundary.

Props on the two sides were mirrored where necessary to retain balanced station routes. The radio table is centered at each station. The existing contracts, NFT metadata, token amounts and deployment files were not changed. These local gameplay changes are not a new public deployment or a wallet proof.

## Verification

Focused tests cover all authored solid centers, body clearance, large step tunneling, sandbags and furniture, wall sliding, navigation around structures, accessible cover, saved position recovery and camera alignment. The browser connected to the actual local practice server, deployed a squad, rejected a minimap destination inside a building, accepted an open ground destination, moved the squad and paused beside a building. Evidence: solid-field-browser-movement.json and solid-field-human-scale.png in docs/evidence. This is local server practice only.

The existing database is preserved at the absolute repository .runtime/rooms.sqlite path. A workspace npm command changes its child working directory, so any explicit DATABASE_PATH should be absolute. No saved recovery or wallet storage was cleared.

## Launch

From the repository root, run the following in separate terminals:

```powershell
$env:SURVIVAL_STATIONS_V2='true'
npm run server
```

```powershell
npm run dev -w @last-signal/web -- --port 5174
```

Preview: http://127.0.0.1:5174/?mode=survival. Refresh an existing tab to load the new renderer. Practice was left paused after browser verification. No new image, model or third party asset was imported.

Verification completed: all 184 tests across 23 files pass using npx vitest run --maxWorkers=2, with TESTNET_DEPLOYMENT_FILE pointing to an absent test manifest to keep unit and local server checks independent of protected public wallet startup. Production build and TypeScript pass. Existing browser evidence records actual local practice rejecting a building destination and accepting open ground. Public wallet transactions were not retested. Preview restored at http://127.0.0.1:5174/survival.html. Correct frontend launch command: npm run dev -w @last-signal/web -- --port 5174.
