# Journey world boundary

Step 04, 3 November 2026. `WorldQuery` supplies bounds, solid volumes, body walkability, swept movement, segment clearance, height aware shot intersection, terrain sample and portal positions. Every new section uses metre coordinates. Ground is Y zero, actor feet sit on ground, and the standing camera and shot origin are Y 1.8. The first world is 72 by 48 metres.

The fixed map adapter retains the old map's 48 by 32 bounds and existing side restrictions, movement and visibility semantics. It does not change legacy collision or retrofit the old line of sight function. New Journey shot rays use explicit volumes. The old 1.5 horizontal render scale remains only in the old Battlefield renderer. Journey's scene has scale one. Screen picking, projected markers and world movement use that same coordinate frame.

The shared FieldCamera now accepts an optional world definition. Its original defaults remain the fixed map. New world dimensions control command view placement; supplied solids and walkability control camera clearance. Independent movement heading and mouse look remain the same behaviour.

Actual checks: the legacy movement and free look regressions pass; the new world tests verify two open side approaches, accessible entrance and exit, blocked body travel, blocked low shots, clear shots above a roof, finite coordinate rejection, unchanged legacy bounds, camera metre position and projection round trip. Focused command with all four files passed 22 cases before the separate capability flag case was added. The later two Journey files pass eleven cases and strict typecheck.

Original solid meshes use the same footprint and height records as simulation. Small facade and roof trim are visual dressing, not independent gameplay cover. No height traversal, low ceilings, streamed origin rebasing or terrain speed variation is claimed in this first flat section. Those are later gates.
