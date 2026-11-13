# J13 custody compatibility assessment

The existing SurvivalRunVault pins HARD_TIMEOUT to 900 seconds and signed entry/result schemas containing deposits, station and bonus reserves, mission stake masks, carry caps and segment continuation. J13 instead approves no player deposit or stake, a 1200 second deadline, one fixed fifteen credit pool reservation and a terminal bank. Reusing those existing settlement meanings would misrepresent this policy or require changing deployed bytecode and signatures.

Use the separate local JourneyRewardPool companion. Preserve SurvivalRunVault, its manifests and recovery adapters. The new companion holds only funded development reward backing, reserves fifteen credits before admission, pays ten or fifteen only on a verified terminal bank, pays zero on quit/death, and allows anyone to free unused backing at timeout. No player deposit is held. Service disappearance cannot leave pool backing permanently reserved.

The protected service must derive settlement from durable gameplay and persist an outbox before submission. Contract code alone does not prove verified gameplay settlement. Automatic worker, checked adapter, admission reservation, confirmation and UI remain required.
