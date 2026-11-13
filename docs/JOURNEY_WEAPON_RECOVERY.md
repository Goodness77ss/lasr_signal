# Journey weapon recovery

Implementation added 11 November 2026; unverified at the owner's request to stop verification runs.

New opt-in simulation rules `journey-practice-0.17.0` preserve previous pinned rules. In server preview, select a locally owned gun token and enable Battlefield weapon recovery. The existing server still checks entry ownership and the exact entry build. This entry currently uses the equipment roster; combined owned-soldier plus collectible-gun entry remains open.

A defeated veteran drops newly recovered battlefield material with a deterministic marksman or support build. The ordinary proximity/visibility/grounded pickup equips that temporary gun, with its magazine and reserve. First person rendering, squad weapon rendering, ammunition and audio use the temporary gun. Entry collectibles remain unchanged. Crossing into the next section returns to entry equipment and clamps ammunition; leaving an unextracted item cannot authorize a claim. Temporary pickup does not depend on the recovery signer being enabled.

Only a terminal, checkpoint-backed bank stages a recovery source in the same SQLite writer transaction. The source binds the run and pickup globally across collection deployments. The durable record contains the simulation rules and exact supported weapon build. A prepared claim pins destination chain, collection and bytecode before signing. The existing Journey gun EIP712 domain binds destination chain and collection; its claim binds source, recipient, run, recovery rules, kind, build and expiry. No enemy-owned token is transferred, seized or reused.

Authenticated, origin-checked and rate-limited endpoints are `/journey/recovery/list`, `/prepare` and `/confirm`. The Armory exposes source loading, separate claim review and submission, plus saved pending receipt recovery. Signatures are returned only to the authenticated source owner and are not written to submission artifacts. Confirmation requires the actual collection event and two canonical confirmations. Rechecking a missing previously recorded receipt marks the source orphaned. No automatic new destination or replacement claim is issued.

Open gates: expiry renewal on the same pinned destination, recovery of externally replaced transactions without a saved hash, broader reorg recovery, complete ordinary combat-to-mint proof and negative cases. Existing legacy salvage and V2 routes are untouched. No public deployment or completed Step 30 acceptance is claimed.
