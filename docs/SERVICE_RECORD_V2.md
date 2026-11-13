# Step 18 service record

Status: PASS_LOCAL_HISTORY. Functional upgrades are DEFERRED under the plan's explicit history only option.

The record is deliberately minimal: the confirmed extraction from which a recovered NFT was minted. It is keyed by collection and token ID, reads the actual onchain provenance source and current owner, and revalidates the saved source proof and canonical vault settlement. It does not invent kill counts, award the original owner's achievement to a buyer, or claim that the weapon participated in later missions. Shop items and records missing local proof have no extraction entry.

Repeated reads return the same single milestone without appending duplicate events. External transfer updates the owner while preserving original provenance and unchanged tokenURI. The former owner fails the ownership adapter. Corrupt proof or a noncanonical settlement fails closed. The public /weapons/history route exposes no signing authorization or wallet session. The NFT inspection dialog displays the verified milestone or an explicit unavailable message.

The local extraction test and six catalog integration cases passed, including repeated history, real external transfer, unchanged metadata and corrupt proof rejection. Evidence: evidence/v2-step18-history.json. Its authored local pickup setup is not natural combat footage. A trade receipt records the actual transfer. No public collection or history service is deployed.

There is no mutable attachment, upgrade endpoint or stat mutation in this release. Immutable build hashes still match the preview, and existing expected build and listing nonce tests reject stale purchases. This avoids an unenforceable UI only listing restriction. The separate original collection remains unchanged.
