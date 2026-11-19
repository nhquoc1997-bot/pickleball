# YOLO Pickleball

A responsive browser-based 3D Pickleball prototype built with Three.js.

## Run locally
Serve the repository root with any static web server (for example VS Code Live Server) and open `index.html`. No build step is required. Three.js, PeerJS and the rigged character asset are loaded from public CDNs / upstream hosting.

## Current prototype
- Responsive YOLO landing page and game HUD.
- 3D court, net, lines, ball and court-side environment.
- A detailed, skinned human GLB athlete with a Mixamo-compatible skeleton, face morph targets and individual skeleton clones for up to four players.
- T-shirt and dark trouser sport outfit tinting, a paddle attached to the right hand, and each player's chosen name printed on the back.
- Motion-captured idle/walk clips blended with a pickleball ready stance, split-step on incoming net crossings, lateral lunge/recovery, ball tracking with head/eyes, and staged Dink, Slice, Lob, Volley, Drive and Smash stroke animations.
- Predictive bot interception and smoother acceleration/deceleration; online snapshots synchronize swing, split-step and lunge cues so all four players see the same actions.
- V8 tactical doubles AI: bots assign a single chaser and a partner-cover role, advance together to a Kitchen-ready formation when play moves to the opposite court, and choose Dink, Slice, Lob, Drive or Smash based on contact height and opponent spacing.
- V9 athlete motion: local-axis footwork profiles drive more expressive lateral shuffle, crossover steps, forward/retreat posture and braking; strokes now blend wind-up/contact/follow-through and distinguish forehand from backhand cues. The camera follows the player's side of the court and reframes for mobile.
- V10 room recovery: guests receive a random per-room resume token, are retried automatically after transient disconnects, can manually reconnect from the game toolbar, and can reclaim their previous team/slot within a 30-second grace period. Host presence shows offline players and expires abandoned slots.
- V11 player statistics: count each player's Dink, Slice, Lob, Volley, Drive and Smash contacts, serves, winners, errors and serve faults. The host synchronizes live stats and the final match report to guests; each device stores its own career matches, wins, win rate and recent results locally.
- Smooth acceleration/deceleration for player movement, keyboard controls and a larger mobile analog joystick with deadzone filtering, safe-area spacing and thumb-friendly shot buttons.
- Local player profile remembers the jersey name and shirt colour on the same device.
- Training mode with four local/demo players and basic bot movement/returns.
- Experimental four-player PeerJS room creation/join by a four-digit code.
- V6 multiplayer reliability layer: compact serializable player snapshots (no Three.js mesh objects), ordered snapshot/input sequence numbers, stale-packet rejection, smoothed remote-ball interpolation, heartbeat and round-trip latency display.
- Validate player movement values and shot types on the host, restrict serve requests to the active server, time out incomplete joins, and report disconnected guests clearly.
- Spin-aware ball flight with aerodynamic drag, Magnus curve, topspin/sidespin profiles per shot, energy loss on court bounce and ground rolling friction.
- Paddle-centred contact window using the rendered paddle position, with height-aware reach checks; online snapshots synchronize ball spin.
- V7 doubles rules engine: official three-part score call (serving score–receiving score–server number), server 1/server 2 rotation, side-out selection from the right service court, and partner side-switches after a serving point.
- Serve starts behind the baseline and is validated against the diagonal service box, sidelines, baseline and Kitchen; a net-touching serve remains live if it lands legally.
- Two-bounce rule tracks actual court bounces; Kitchen faults are based on a true airborne volley rather than the selected shot label, including a short follow-through check for momentum into the Kitchen.
- Match ends at 11 points with a two-point lead; final score and winner are displayed to every connected player.
- Loading progress and automatic fallback to the procedural avatar if the external GLB cannot be reached.

## Athlete asset and licensing
The game loads `andre_casual.glb` from the public Avatar Studio repository at runtime. The file is approximately 12.7 MB and is fetched once per browser session; the same geometry and textures are reused while each player gets an independent cloned skeleton and materials.

The Avatar Studio project identifies its character models and motion capture as derived from the Microsoft Rocketbox Avatar Library under the MIT license. The MIT copyright and permission notice is included in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The model binary is currently hosted by the upstream project, not mirrored in this repository. For a production launch, mirror the licensed GLB to YOLO-controlled storage and optimize/compress it for mobile delivery.

## Important limitations
This is still a prototype, not a production multiplayer game or a certified rules engine.
- The current human model is a single male base appearance shared by players, with different shirt colours and names. A proper avatar selector and a broader range of body types are future work.
- Idle and walk use the source motion-capture clips. Pickleball ready stance, split-step, lunge, ball tracking and stroke phases are procedural skeletal animations, not sport-specific motion-capture. Dedicated pickleball mocap is still needed for competition-level realism.
- PeerJS uses public signaling and direct peer connections. V6 adds heartbeat/latency checks and clearer disconnect handling, but NAT/firewall restrictions can still prevent some players from connecting; there is no TURN relay.
- The host browser currently acts as the game authority. V10 supports guest reconnection while the host remains online, but there is no host migration or dedicated relay; if the host closes the tab or loses its PeerJS session, the room ends.
- No server-backed user accounts, matchmaking, moderation, anti-cheat, spectator mode or dedicated authoritative server is included. V11 career history is stored locally in the browser and does not sync across devices.
- V8 training bots use a lightweight tactical policy and heuristic court coverage. They are not trained neural opponents and still need human playtesting and difficulty tuning.
- V7 covers the core recreational doubles score/serve sequence, diagonal service-box landing, no-let serves and Kitchen volley/momentum faults, with automated unit tests for the pure rules. It is not a certified tournament rules engine: foot-fault timing, referee line calls, hinder/replay cases, stacking/position exceptions and tournament-specific formats still need implementation and live validation.
- Physics is still an arcade approximation: spin, drag and bounce are implemented but not calibrated against measured ball data. Paddle contact uses a 3D proximity window around the paddle rather than a full rigid-body racket collision.

For public launch, move to an authoritative WebSocket server (e.g. Colyseus), add TURN relay, server-side physics and validated rules, room lifecycle/reconnect handling, authentication, monitoring and load testing. For the next animation milestone, replace the procedural swing overlays with pickleball-specific motion-capture clips retargeted to this rig.

## Validation
GitHub Actions checks JavaScript module syntax and verifies the app entry points on pushes and pull requests.

## Deployment
Static hosting works with GitHub Pages or Vercel. For Vercel, use the repository root, no build command and `.` as the output directory.
