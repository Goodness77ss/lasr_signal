# Journey demo launch

Run `npm run journey:demo` from the repository root. It starts a fresh disposable local chain, deploys separate Journey contracts, starts the authoritative service, then starts the Journey frontend with an API proxy to that exact service. It chooses distinct available ports and prints the actual URLs. Existing sessions are left running. Type `stop` then Enter in its terminal for managed shutdown.

No tests or acceptance runners are invoked by this command. Contract compilation and actual development issuance are necessary to launch the chain. The authored fixture includes seven soldiers, two collectible guns, two unopened packs per class and 45 local test credits backing the reward pool. These are authored development assets, not earned gameplay evidence.

To receive the authored assets in your own local wallet, set a public address before launching:

```powershell
$env:JOURNEY_DEV_OWNER='0xYourPublicWalletAddress'
npm run journey:demo
```

Configure that wallet for chain 31337 and the RPC URL printed by the launcher. A custom recipient receives disposable gas and 100 local test currency units. Do not enter or send a private key. With no owner setting, the assets belong to a fresh unlocked fixture account; the free practice roster remains available without wallet setup.

The demo writes public deployment identities to the printed `demo-public.json`. Its session record under `.runtime/journey-demo` records URLs, process IDs and startup/stop state, without keys or signatures. Restarting the command creates a new chain and new collections. A database backup alone does not restore the disposable chain.

## Demonstration route

1. Open the printed server preview URL. Choose the free roster for immediate combat, or use owned roster preparation after wallet setup.
2. Move with WASD or touch arrows, drag to look, fire, reload and try the class ability and grenades.
3. Defeat the encounter, reach its checkpoint and choose bank or continue. Practice credits are simulated unless a separately backed funded entry was admitted.
4. Use Armory for checked local asset inspection, soldier market controls and banked recovery. Fresh demo soldier collections now use combined rules 0.18, with optional collectible gun IDs per deployed slot. Earlier 0.16 collections retain signature-only entry. Combined chain acceptance remains open.
5. Keep the independent recovery URL and public deployment JSON available for a service interruption. It supports timeout and previously prepared weapon claims through the wallet RPC.

## Known interruption route

A lost connection is not a confirmed quit. Use RECONNECT or RESUME SAVED JOURNEY with the same wallet and saved run identity. Pending soldier progress, supply redemption and weapon recovery have separate source flows. A timed-out funded run can release its reservation directly on the independent recovery page after the on-chain deadline. Terminal orphaned funded settlements are marked uncertain and still require reconciliation work; do not report them as confirmed payouts.

## Actual startup record

On 11 November the first managed attempt failed with ECONNRESET during deployment. Moving interval mining until after deployment allowed the next actual launch to reach service ready and Vite ready. No gameplay, human feedback or wallet acceptance is inferred from startup. The command remains development tooling, not a public deployment.
