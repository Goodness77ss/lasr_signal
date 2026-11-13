# Optional mission verification

Step 8 passed on 2 November 2026. This is server practice with simulated units only. New runs pin survival-2.5.0. Old rules and original contracts remain unchanged.

Hold the Signal requires a friendly station, a legal preparing or living assigned assault, enough available stake, a reserved bonus, and enough active and wall time. The offer never accepts itself. Decline and offer expiry charge nothing. Explicit acceptance locks five existing run units once. Field credits and a future bonus cannot fund acceptance.

Retain the station for thirty active seconds after assault arrival and defeat every assigned attacker within sixty seconds. Success releases the five unit lock and adds three bonus units. Returning the stake is not income. Ordinary death, surrender, station loss or mission expiry consumes five once. A service, invalid route or checkpoint abort releases the stake and reserved bonus without a failure charge.

Bonus reservations share the rolling 200 unit practice scope cap with station rewards. Pending reservations continue occupying capacity. Segment bonus capacity is six and run bonus capacity thirty. Acceptance, resolution, command acknowledgment and checkpoint commit in one database transaction. Recovery reconciles bonus, failed stake, locked stake and the outstanding mission with the reservation ledger.

Fifteen mission cases and all 130 application tests passed with strict compilation. Cases include exact final tick success versus death, expiry, service abort, insufficient stake, missing reservations, cap exhaustion, duplicate finalization and an actual authoritative combat run that accepts an offer and restores its lock after restart. These are automated checks, not human playtests.

Browser evidence so far: a normal starter run with explicitly labeled automated combat assistance reached a legal assault offer at 119 active seconds. Explicit decline left eight available units and no charge. Images are evidence/v2-step8-offer.png and evidence/v2-step8-declined.png. The assist uses ordinary validated move, fire, reload and support orders. It pauses at an offer and never chooses a mission decision. Acceptance, success and failure browser checks remain pending until recorded below.

The five stake and three bonus ratio needs success above 62.5 percent before other costs for positive expected return. No human completion rate or reward attractiveness is claimed from this automated fixture.

The browser acceptance check locked five from eight and showed three available. After real combat the mission succeeded, showing station earnings eight, bonus three, failure zero, lock zero and available eleven. Images: evidence/v2-step8-accepted.png and evidence/v2-step8-success.png. The authoritative combat integration also completed the mission after restoring its accepted checkpoint; all fifteen mission cases passed after that extension.

The final browser run explicitly accepted a five unit stake, resumed and surrendered at 123 active seconds. The mission became FAILED, station earnings remained eight, failed stake became five, locked stake became zero and available funds remained three. Image: evidence/v2-step8-failed.png. The build passed after correcting stale acknowledgment text between runs, resolved mission countdowns and the initial ready message. The dedicated publishable secret scan also passed. This completes the Step 8 exit evidence. Earlier pending statements above describe the sequence of checks, not remaining work.
