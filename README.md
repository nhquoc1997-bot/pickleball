# YOLO Pickleball

A responsive browser-based 3D Pickleball prototype built with Three.js.

## Run locally
Serve the repository root with any static web server (for example VS Code Live Server) and open `index.html`. No build step is required. Three.js and PeerJS are loaded from public CDNs.

## Current prototype
- Responsive YOLO landing page and game HUD.
- 3D court, net, lines, ball and procedural player avatars.
- Player display name on the back of the jersey and selectable shirt colors.
- Keyboard movement (WASD / arrow keys), mobile virtual joystick and touch controls.
- Dink, slice, lob, volley, drive and smash actions with basic swing animation.
- Training mode with four local/demo players and basic bot movement/returns.
- Experimental four-player PeerJS room creation/join by a four-digit code.
- Basic ball gravity, bounce, court boundary and net collision handling.
- Prototype serve sequence, two-bounce requirement, non-volley-zone volley fault and side-out style scoring to 11, win by 2.

## Important limitations
This is still a prototype, not a production multiplayer game or a certified rules engine.
- PeerJS uses public signaling and direct peer connections. NAT/firewall restrictions can prevent some players from connecting; there is no TURN relay.
- The host browser currently acts as the game authority. If the host closes the tab or loses connection, the room ends.
- No persistent user accounts, matchmaking, moderation, anti-cheat, robust reconnect, spectator mode or dedicated server is included.
- Avatar geometry and animation are procedural placeholders, not photorealistic scanned athletes or motion-captured animation.
- Scoring and serve handling are simplified. Full official doubles service rotation, faults, let serves, kitchen momentum rules, line calls and tournament edge cases still require implementation and testing.
- Physics is an arcade approximation; it does not yet model paddle contact, spin, aerodynamic drag or calibrated ball/racket collision.

For public launch, move to an authoritative WebSocket server (e.g. Colyseus), add TURN relay, server-side physics and validated rules, room lifecycle/reconnect handling, authentication, monitoring and load testing. For higher visual fidelity, replace procedural avatars with properly licensed rigged GLB characters and motion-captured animation clips.

## Validation
A GitHub Actions workflow checks JavaScript module syntax and verifies the app entry points on pushes and pull requests.

## Deployment
Static hosting works with GitHub Pages or Vercel. For Vercel, use the repository root, no build command and `.` as the output directory.
