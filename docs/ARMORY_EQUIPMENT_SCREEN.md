# Armory equipment screen

3 November 2026. Replaced the promotional page layout with a compact equipment menu. Added icon navigation, smaller inventory slots, a bunker preview stage and gun preview on pointer hover. Removed the introductory and closing marketing sections. Moved long wallet explanations under Rules & help, retaining financial terms, balances, confirmations and recovery controls.

New original asset: `apps/web/public/art/armory-bunker-v1.png`. Generated using built in image_gen.imagegen, no supplied third party reference. This is decorative environment art, distributed under project source terms, not a gameplay screenshot or a new 3D scene. Original vector navigation icons are authored in armory-hub.ts. Existing NFT images and wallet actions are unchanged.

Generation prompt:

> Original cinematic indie survival game equipment room background, wide landscape 1536x1024. Abandoned field bunker armory workbench, worn dark olive steel pegboard, empty gun racks, scattered empty ammunition crates at far edges, brass task lamp warm pool of light, drifting dust, charcoal shadows, restrained amber highlights, tactile gritty painted game environment. Central and left areas dark and uncluttered to support readable inventory interface overlay. No guns, no people, no text, no logos, no UI, no commercial game reference. Detailed atmospheric environment concept art.

Verification: TypeScript and production build pass. Actual browser review shows the bunker art, icon navigation, compact gun cards, current prices and disabled purchase buttons without a wallet. Desktop and phone evidence are saved alongside the earlier Armory evidence. No new wallet transaction was submitted. Launch commands remain npm run server and npm run dev -w @last-signal/web -- --port 5174. Preview: http://127.0.0.1:5174/armory.html.
