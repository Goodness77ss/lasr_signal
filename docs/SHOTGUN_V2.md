# Step 17 shotgun review

Status: PASS_LOCAL_LAB. Server practice and verified local NFT ownership are implemented. Shotgun use in funded survival missions and public NFT issuance remain outside this release. Existing funded survival 2.7.0 rules and previous run checkpoints retain their original behavior.

The isolated weapon lab has authored matched scenes with a static 3000 HP target that cannot fire. It has no token, extraction, NFT reward or saved progress authority. A free practice entitlement is separate from its optional authenticated owned NFT route. Ownership is checked against the explicit collection at start and during play. Reads older than three seconds suspend ticks and controls. External transfer pauses the old owner's session.

Five deterministic rays span thirty degrees, each using server wall, visibility, protected home and body tests with eight unit maximum range. Their shared damage budget is thirty, with falloff after two units and a floor of one quarter per ray. Cosmetic effects never add damage. Six shells, sixteen ticks between shots and forty four ticks to reload are enforced by the server. Switching cannot cancel a pending shotgun shot, its cadence or reload, and never creates ammunition. The standard rifle keeps twenty damage, five tick cadence and fourteen unit range. Existing rendering materials and bounded effects are reused; the shotgun silhouette currently uses a wider and shorter procedural prototype gun.

Four weapon tests and a real local NFT ownership and external transfer integration test passed. All 173 application cases passed. The matched visible Chrome samples on Intel HD 520, with effects enabled, measured rifle 58.60 FPS, p95 frame 16.9 ms, mean 250.42 draw calls; shotgun 59.27 FPS, p95 16.8 ms, mean 244.27 calls. Final sampled server p95 tick costs were 0.484 ms and 0.652 ms. Both scenes used a 1008 by 675 viewport, 1240 by 438 render size, one player and one authored target. This is a short automated sample on one computer, not phone or multiplayer performance acceptance. The original Step 10 human review remains deferred.

Evidence: evidence/v2-step17-rifle-performance.json, evidence/v2-step17-shotgun-performance.json and evidence/v2-step17-shotgun-browser.png. The actual exported silent video is evidence/v2-step17-shotgun.webm, 2139458 bytes, SHA256 FFF68D05371E3124933FF5909A4A88E9B803E0E55E8C8A895CEFDCC60F521822. Chrome decoded it at 960 by 540 and the screenshot evidence/v2-step17-video-decoded.png shows its automatic server lab label at fourteen seconds. The separate recorder manifest export stalled; exact duration is not asserted. Footage is authored target practice, not a naturally completed mission.

```powershell
$env:SURVIVAL_WEAPON_LAB='true'
$env:SURVIVAL_VAULT_V2='false'
$env:HOST='127.0.0.1'
$env:PORT='3004'
$env:DATABASE_PATH='C:/Users/DELL/Documents/LAST_SIGNAL_CODEX_PACK/last_signal/.runtime/weapon-lab-local.sqlite'
$env:ALLOWED_ORIGINS='http://127.0.0.1:5177,http://localhost:5177'
npm run server
```

In another terminal:

```powershell
$env:LAST_SIGNAL_SERVICE_ORIGIN='http://127.0.0.1:3004'
npm run dev -w @last-signal/web -- --port 5177 --strictPort
```

Open http://127.0.0.1:5177/weapon-lab.html. For owned NFT play, enable this flag on a service with the verified collections configured, authenticate and save a loadout on its Collections page, then use the lab on the same origin. No network change or wallet transaction is needed to play. Lab connections are bounded to sixteen, controls to forty messages per second, active duration to ten minutes and wall duration to fifteen minutes. Sessions are ephemeral.
