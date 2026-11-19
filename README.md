# YOLO Pickleball

A responsive browser-based 3D Pickleball prototype.

## Run locally
Serve the repository root with any static web server (for example VS Code Live Server). Open `index.html`. No build command is required. Three.js and PeerJS are loaded from public CDNs.

## Included in this prototype
- YOLO landing page and responsive game HUD.
- Three.js 3D court, net, court lines, ball and stylized 3D player avatars.
- Player name rendered on the back of the jersey; selectable shirt colors.
- Keyboard movement (WASD / arrows), mobile virtual joystick and touch shot controls.
- Dink, slice, lob, volley, drive and smash shot selection.
- Training mode with four local/demo player avatars.
- Experimental PeerJS peer-to-peer room creation and joining by a four-digit code.

## Important multiplayer limitations
This is an early prototype, not a production multiplayer game. PeerJS uses a public signaling service and direct peer connections; browser network restrictions and NAT/firewall conditions may prevent some users from connecting. There is no TURN relay, authoritative dedicated game server, persistent accounts, matchmaking, robust reconnect, anti-cheat or validated tournament scoring. The ball simulation and game rules are still simplified.

For public launch, the next engineering phase should use an authoritative WebSocket game server (for example Colyseus), add TURN relay, server-side physics and rules, room lifecycle, reconnect handling, authentication, monitoring and load testing.

## Deployment
Static hosting works with GitHub Pages or Vercel. For Vercel, use the repository root, no build command, and `.` as the output directory.
