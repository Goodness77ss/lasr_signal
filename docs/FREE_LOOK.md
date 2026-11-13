# Independent looking and movement

3 November 2026. Mouse look and aiming no longer turn an ongoing movement input. The shared FieldCamera captures the look heading when movement begins, and uses that heading for forward, backward and strafe inputs until movement is released. Looking can rotate through a full circle and up or down without changing the travel direction. Shooting still follows the view.

Release movement and press again to travel relative to the new view. Neutral input, a round reset and a view change clear the stored heading. The six existing control loops release it when keyboard or touch movement is idle. Key release also clears it immediately where those handlers track the held keys. Touch movement retains its direction while dragging to look.

This applies to Endless, Classic, Station Survival and the existing private, salvage, funded preview and weapon lab controls that use FieldCamera. No movement speed, collision, reward, wallet or contract rule was changed. Input continues to use the existing server command validation.

Verification: TypeScript and production build pass. All 193 application tests across 25 files pass with two workers and an absent public testnet manifest for isolated local checks. Five new tests cover forward and backward movement during sideways and vertical look, neutral release and new heading, normalized diagonal movement during full rotation, reset and view changes, and independent move and shot commands sent to the actual simulation. No live wallet transaction was performed. Manual browser play was not repeated for this controls update.

Use Eye Level and Take Control for mouse look, or the existing drag controls. Hold W or S while looking. Release movement before choosing a new travel heading. Refresh an existing game tab to load the updated controls.

Preview: http://127.0.0.1:5174/. Launch the service with npm run server and SURVIVAL_STATIONS_V2=true. Launch the frontend with npm run dev -w @last-signal/web -- --port 5174.
