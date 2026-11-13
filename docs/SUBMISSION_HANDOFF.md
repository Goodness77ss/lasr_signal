# Submission handoff

Run `npm ci`, then `npm run journey:demo` from the extracted source directory. The launcher prints the actual browser, service and local chain RPC URLs. Use Node.js 24 or newer. Type `stop` then Enter in that terminal to stop its managed session.

Run `npm run journey:release` to produce one ZIP containing source, evidence, the Journey frontend bundle and launch instructions. Dependencies, private runtime, databases, keys and runtime signatures are excluded.

Implemented source includes combined owned soldier/gun rosters under rules 0.18, checkpoint progress staging, marked battlefield weapon recovery, local funded reservation/settlement, independent wallet recovery, HUD/touch controls and shared Armory soldier/gun/supply controls. Earlier collections and original recovery routes are retained. Steps 26 and 28 remain deferred by the owner.

The owner accepted a short free-roster demonstration. Frontend production build and managed chain/service/frontend startup succeeded. The latest wallet, combined combat/chain, restart/reorganisation and performance acceptance have not been run after the instruction to stop verification. Public testnet is excluded. Primary Endless remains unchanged while those gates are open.

A consistent private database backup was created on 11 November using the Node SQLite online backup API. It is retained under `.runtime/journey-backups` and is excluded from submission ZIPs. Restoration has not been tested. A new demo launch creates a fresh disposable chain; restoring SQLite alone does not restore that chain or its contracts.

Remaining work is the complete combined wallet A to combat/bank/progress/supply/recovery to wallet B sale demonstration, rendered performance evidence, latest adversarial acceptance, backup restoration proof and the gated primary entry switch. Signed service transactions whose nonce was consumed still require independent timeout or further operator reconciliation. No completed full forty-step acceptance is claimed.

For a local rollback, stop the managed Journey demo, build the normal frontend without Journey mode or VITE_JOURNEY_ENABLED, and run the original service with JOURNEY_ENABLED unset or false. Keep old manifests and direct wallet recovery URLs available. The existing Classic, Station and original Endless entries remain in place.

See JOURNEY_DEMO_LAUNCH.md for the demo/interruption script, JOURNEY_INDEPENDENT_RECOVERY.md for source-specific recovery and JOURNEY_IMPLEMENTATION_STATUS.md for scope.
