# Landing mode artwork

3 November 2026. Added three original generated illustrations to the existing mode selection cards. Mode routes, quit confirmation and reward policy are unchanged. Existing icons, titles, objectives and Play controls remain above the images. Dark overlays and responsive crops preserve readable text. Reduced motion disables hover movement.

Tool: built in image_gen.imagegen, one generation per scene, no reference images supplied. Original outputs were retained under the Codex generated image folder and copied into the project. No new package, external stock image or commercial game asset was introduced. These are promotional concept illustrations, not gameplay screenshots, new game models or multiplayer evidence. Assets are distributed under project source terms. Existing Barlow font licenses apply.

## endless

Saved path: apps/web/public/art/modes/endless-v1.png

Prompt:

Original cinematic painted key art for LAST SIGNAL, a fictional indie squad survival game. Landscape 1536x1024 composition for a game mode selection card. Worn olive uniforms, dark charcoal, weathered brass, walnut rifles, muddy ruined brick compound, rain and drifting dust, dramatic restrained warm light. Strong readable silhouettes and tactile detailed materials, painterly realistic concept art. No text, letters, logos, interface, national flags, insignia, commercial game references, gore or copied characters. This is promotional concept art, not a gameplay screenshot. Keep the action concentrated in the upper and middle two thirds with darker uncluttered lower third for overlaid title. Scene: Three fictional helmeted soldiers shelter behind battered sandbags, one reloading a wooden rifle as many small enemy silhouettes emerge through smoky rain beyond a ruined wall. Amber muzzle light, urgency, layered depth, shoulder height view behind the defenders.

## classic

Saved path: apps/web/public/art/modes/classic-v1.png

Prompt:

Original cinematic painted key art for LAST SIGNAL, a fictional indie squad survival game. Landscape 1536x1024 composition for a game mode selection card. Worn olive uniforms, dark charcoal, weathered brass, walnut rifles, muddy ruined brick compound, rain and drifting dust, dramatic restrained warm light. Strong readable silhouettes and tactile detailed materials, painterly realistic concept art. No text, letters, logos, interface, national flags, insignia, commercial game references, gore or copied characters. This is promotional concept art, not a gameplay screenshot. Keep the action concentrated in the upper and middle two thirds with darker uncluttered lower third for overlaid title. Scene: A soldier raising a plain unmarked cloth signal pennant at a battered field radio station with a tall aerial, another guards the approach with a walnut rifle. Two opposing squads as distant silhouettes across muddy lanes. Strong central radio mast silhouette, dusty golden backlight, sense of capturing and holding contested ground.

## survival

Saved path: apps/web/public/art/modes/survival-v1.png

Prompt:

Original cinematic painted key art for LAST SIGNAL, a fictional indie squad survival game. Landscape 1536x1024 composition for a game mode selection card. Worn olive uniforms, dark charcoal, weathered brass, walnut rifles, muddy ruined brick compound, rain and drifting dust, dramatic restrained warm light. Strong readable silhouettes and tactile detailed materials, painterly realistic concept art. No text, letters, logos, interface, national flags, insignia, commercial game references, gore or copied characters. This is promotional concept art, not a gameplay screenshot. Keep the action concentrated in the upper and middle two thirds with darker uncluttered lower third for overlaid title. Scene: Two exhausted fictional helmeted soldiers carrying canvas equipment bags move toward a small green illuminated extraction beacon at a western timber gate, one looks back toward a distant ruined radio station through rain. Warm bunker doorway light meets restrained green signal light, sense of escape and bringing loot home. No helicopter or modern tactical equipment.

## Verification and preview

TypeScript and production build pass. Browser review checks all three images load, mode links remain correct, text contrast and desktop and phone layout. Screenshots: docs/evidence/landing-art-desktop.png and landing-art-phone.png. No wallet transaction or game round was started for this visual update.

Preview: http://127.0.0.1:5174/. Frontend launch: npm run dev -w @last-signal/web -- --port 5174. Game service launch: npm run server with SURVIVAL_STATIONS_V2=true and the existing database.

