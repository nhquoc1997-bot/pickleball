# YOLO Pickleball

A responsive browser-based 3D Pickleball prototype built with Three.js.

## Run locally
Serve the repository root with any static web server (for example VS Code Live Server) and open `index.html`. No build step is required. Three.js, PeerJS and the rigged character asset are loaded from public CDNs / upstream hosting.

## Current prototype
- Responsive YOLO landing page and game HUD.
- 3D court, net, lines, ball and court-side environment.
- A detailed, skinned human GLB athlete with a Mixamo-compatible skeleton, face morph targets and individual skeleton clones for up to four players.
- T-shirt and dark trouser sport outfit tinting, a paddle attached to the right hand, and each player's chosen name printed on the back.
- Motion-captured idle/walk clips blended with procedural footwork, body lean, blinking and sport-specific Dink, Slice, Lob, Volley, Drive and Smash swing overlays.
- Smooth acceleration/deceleration for player movement, keyboard controls and mobile virtual joystick / touch shot controls.
- Training mode with four local/demo players and basic bot movement/returns.
- Experimental four-player PeerJS room creation/join by a four-digit code.
- Basic ball gravity, bounce, court boundary and net collision handling.
- Prototype serve sequence, two-bounce requirement, non-volley-zone volley fault and side-out-style scoring to 11, win by 2.
- Loading progress and automatic fallback to the procedural avatar if the external GLB cannot be reached.

## Athlete asset and licensing
The game loads `andre_casual.glb` from the public Avatar Studio repository at runtime. The file is approximately 12.7 MB and is fetched once per browser session; the same geometry and textures are reused while each player gets an independent cloned skeleton and materials.

The Avatar Studio project identifies its character models and motion capture as derived from the Microsoft Rocketbox Avatar Library under the MIT license. The MIT copyright and permission notice is included in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The model binary is currently hosted by the upstream project, not mirrored in this repository. For a production launch, mirror the licensed GLB to YOLO-controlled storage and optimize/compress it for mobile delivery.

## Important limitations
This is still a prototype, not a production multiplayer game or a certified rules engine.
- The current human model is a single male base appearance shared by players, with different shirt colours and names. A proper avatar selector and a broader range of body types are future work.
- Idle and walk use the source motion-capture clips; pickleball strokes are custom procedural skeletal overlays, not sport-specific motion-capture. High-quality pickleball mocap is still needed for competition-level realism.
- PeerJS uses public signaling and direct peer connections. NAT/firewall restrictions can prevent some players from connecting; there is no TURN relay.
- The host browser currently acts as the game authority. If the host closes the tab or loses connection, the room ends.
- No persistent user accounts, matchmaking, moderation, anti-cheat, robust reconnect, spectator mode or dedicated authoritative server is included.
- Scoring and serve handling are simplified. Full official doubles service sequence, faults, let serves, kitchen momentum rules, line calls and tournament edge cases still require implementation and testing.
- Physics is an arcade approximation; it does not yet model paddle contact, spin, aerodynamic drag or calibrated ball/racket collision.

For public launch, move to an authoritative WebSocket server (e.g. Colyseus), add TURN relay, server-side physics and validated rules, room lifecycle/reconnect handling, authentication, monitoring and load testing. For the next animation milestone, replace the procedural swing overlays with pickleball-specific motion-capture clips retargeted to this rig.

## Validation
GitHub Actions checks JavaScript module syntax and verifies the app entry points on pushes and pull requests.

## Deployment
Static hosting works with GitHub Pages or Vercel. For Vercel, use the repository root, no build command and `.` as the output directory.
