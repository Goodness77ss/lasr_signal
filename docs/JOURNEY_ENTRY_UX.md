# Simplified Journey entry

11 November 2026. The owner reported that the preparation form was confusing for average players and asked to simplify it and reduce steps.

The default screen now presents a ready squad, Mara with two free rifle helpers, and PLAY JOURNEY. Change squad is optional. Continue saved run appears only when a saved recovery identity exists. Basic practice does not read or submit hidden NFT fields.

Owned play is a separate optional section. Connect Wallet loads the registered collection's actual owned soldiers. Players choose named soldiers from dropdowns instead of entering token IDs. The default owned squad uses one available owned leader and two free helpers, reducing required deployment transactions. Standard weapons are preselected; eligible owned guns load as optional named choices.

DEPLOY SQUAD prepares or recovers the saved exact-run approvals, waits for confirmation and submits the original admission. Existing owner/session, build, nonce, lease, rules and recovery checks remain in the flow. A rejected or interrupted approval preserves the draft and stops entry. Required wallet approvals remain visible, including the temporary transfer/sale lock explanation.

Funded reward settings, opened supplies and transaction recovery are optional details. Market trading stays in the Armory. The manual gun-only compatibility route is under More equipment and recovery options. Saved drafts from earlier entry versions keep their original helper selection and run identity.

Frontend production compilation succeeded. No tests, strict type checks or browser/wallet acceptance runs were performed for this change. The running Vite frontend serves the updated source; earlier release ZIPs predate this entry redesign.

## Wallet-only Armory and Journey setup

11 November. The owner explicitly requested wallet connection as the only crypto setup across Journey and Armory, with complex crypto terminology removed from the ordinary player flow.

A shared connection helper handles wallet access, configured game connection selection and the ownership sign-in prompt in one application action. The service can revalidate an existing signed session so navigating between Journey and Armory does not require a second sign-in. Local launchers provide public connection metadata for supported wallets to add the demo connection. Wallet approval dialogs remain necessary; the app never requests a private key or bypasses consent. An already-configured local wallet can still point to an earlier disposable RPC and may need its saved demo connection updated through wallet settings.

The Armory now loads named soldier, weapon and unopened-pack cards from the registered collections. Marketplace listings and prices come from checked current chain state. My equipment is filtered through the authenticated wallet. Players select cards and use Equip, Buy, Sell, Remove sale or Open pack. Price entry and display use ordinary test-credit amounts with checked decimal conversion. Purchases retain exact amount permissions and fresh seller/price/revision/build checks internally.

No ordinary market form asks for an item ID, seller address, transaction hash, raw unit amount or collection address. Reward cards find their original acceptance events by source and let players Collect or Save progress. Pending requests retain actual transaction identity and expose Finish pending request. Opened-pack service credit remains separate from the confirmed burn, with a retry of the same receipt rather than another burn.

Equip carries the chosen item into roster preparation. Named owned inventory still rechecks actual ownership before deployment. Standard practice remains one click. Manual equipment fields are hidden in the ordinary Journey view; the explicit development review route and separate emergency support retain their compatibility tools. Earlier collection adapters and recovery controls remain available under Earlier equipment and support, not mixed into the primary purchase flow.

The new UI uses the existing original on-chain artwork and CSS. The frontend bundle compiled and a fresh service/frontend started. No browser, wallet transaction, chain acceptance or strict typecheck run was performed. Earlier release ZIPs predate this change.
