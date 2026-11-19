import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const COURT = { width: 6.1, length: 13.41, halfW: 3.05, halfL: 6.705, kitchen: 2.13 };
const SHOTS = {
  dink:   { speed: 4.7, lift: 3.1, label: "DINK · Bóng mềm qua kitchen" },
  slice:  { speed: 6.5, lift: 2.0, label: "SLICE · Cắt bóng tạo xoáy" },
  lob:    { speed: 5.3, lift: 7.6, label: "LOB · Bóng bổng qua đầu" },
  volley: { speed: 8.4, lift: 2.6, label: "VOLLEY · Đánh bóng trên không" },
  drive:  { speed: 10.0, lift: 2.2, label: "DRIVE · Đánh nhanh" },
  smash:  { speed: 12.0, lift: 3.3, label: "SMASH · Đập bóng" }
};
const S = {
  name: "YOLO PLAYER", color: "#c7f36b", mode: "training", code: "TRAINING",
  peer: null, conns: new Map(), host: false, networkReady: false,
  players: [], id: "local", keys: new Set(), joy: { x: 0, z: 0 },
  score: [0, 0], servingTeam: 0, serverIndex: 0, rally: 0,
  phase: "ready", expectedBounceTeam: null, sideBounces: [0, 0],
  lastHitTeam: 0, ball: null, velocity: null, shot: "drive", cooldown: 0,
  scene: null, camera: null, renderer: null, clock: new THREE.Clock(),
  lastNet: 0, lastSnapshot: 0, pointTimer: null, disposed: false
};

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
}
function showScreen(game) {
  $("#homeScreen").hidden = game;
  $("#gameScreen").hidden = !game;
  if (game) {
    if (!S.renderer) initScene();
    else resizeRenderer();
  }
}
function syncScore() {
  $("#scoreHome").textContent = String(S.score[0]).padStart(2, "0");
  $("#scoreAway").textContent = String(S.score[1]).padStart(2, "0");
  $("#rallyLabel").textContent = S.phase === "ready" ? "SERVE" : String(S.rally).padStart(2, "0");
  const team = S.servingTeam === 0 ? "TEAM YOLO" : "OPPONENT";
  $(".score-center span").textContent = "SERVING";
  $(".score-center b").textContent = team;
}
function cleanName(value) {
  return (value || "YOLO PLAYER").trim().replace(/[<>]/g, "").slice(0, 14).toUpperCase() || "YOLO PLAYER";
}
function setName(value) {
  S.name = cleanName(value);
  $("#playerDisplayName").textContent = S.name;
  $("#sidebarPlayerName").textContent = S.name;
  $("#playerAvatar").textContent = S.name[0];
  $("#profileButton").textContent = S.name[0];
  $("#jerseyInput").value = S.name;
  $("#profileNameInput").value = S.name;
  const local = S.players.find(p => p.id === S.id);
  if (local) local.name = S.name;
  updatePlayerLabels();
  syncPlayerUI();
}
function syncPlayerUI() {
  const list = $("#playerList");
  list.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const p = S.players[i];
    const row = document.createElement("div");
    row.className = "player-row" + (p ? "" : " waiting");
    const dot = document.createElement("span"); dot.className = "player-dot";
    const name = document.createElement("b"); name.textContent = p ? p.name : "Đang chờ người chơi";
    const role = document.createElement("small");
    role.textContent = p ? (p.id === S.id ? "YOU" : (p.team === 0 ? "TEAM A" : "TEAM B")) : String(i + 1).padStart(2, "0");
    row.append(dot, name, role); list.append(row);
  }
  $("#playerCount").textContent = String(S.players.length).padStart(2, "0") + " / 04";
}
function positionForSlot(slot) {
  const team = slot < 2 ? 0 : 1;
  const x = slot % 2 === 0 ? -1.05 : 1.05;
  const z = team === 0 ? 4.65 : -4.65;
  return { team, x, z, rotation: team === 0 ? 0 : Math.PI, slot };
}
function createPlayer(slot, id, name, color) {
  return { id, name: cleanName(name), color: color || "#c7f36b", ...positionForSlot(slot),
    targetX: null, targetZ: null, targetRotation: null, mesh: null,
    swing: 0, swingType: "drive", bot: false, botThink: 0 };
}
function updatePlayerLabels() {
  for (const p of S.players) {
    if (!p.mesh) continue;
    const q = p.mesh.userData;
    q.ctx.clearRect(0, 0, 512, 256);
    q.ctx.fillStyle = "#142018";
    q.ctx.font = "900 64px Arial";
    q.ctx.textAlign = "center";
    q.ctx.fillText((p.name || "YOLO").slice(0, 14), 256, 160);
    q.tex.needsUpdate = true;
    q.torso.material.color.set(p.color || "#c7f36b");
  }
}
function updateMeshes() {
  if (!S.scene) return;
  for (const p of S.players) {
    if (!p.mesh) {
      p.mesh = createAvatar(p);
      S.scene.add(p.mesh);
    }
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.rotation || 0;
  }
  for (const child of [...S.scene.children]) {
    if (child.userData.playerId && !S.players.some(p => p.id === child.userData.playerId)) S.scene.remove(child);
  }
  syncPlayerUI();
  updatePlayerLabels();
}

function createAvatar(p) {
  const root = new THREE.Group();
  root.userData.playerId = p.id;
  const shirt = new THREE.MeshStandardMaterial({ color: p.color || "#c7f36b", roughness: .78 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99070, roughness: .9 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0x17251d, roughness: .85 });
  const shoes = new THREE.MeshStandardMaterial({ color: 0xe9eee4, roughness: .75 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x29231f, roughness: 1 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.245, .43, 5, 10), shirt);
  torso.position.y = 1.27; root.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.075, .09, .14, 10), skin);
  neck.position.y = 1.68; root.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 18, 14), skin);
  head.position.y = 1.86; root.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.177, 18, 10, 0, Math.PI * 2, 0, Math.PI * .57), hairMat);
  hair.position.y = 1.91; root.add(hair);
  const shortsMesh = new THREE.Mesh(new THREE.BoxGeometry(.43, .29, .29), shorts);
  shortsMesh.position.y = .88; root.add(shortsMesh);
  const hipL = new THREE.Group(); hipL.position.set(-.12, .78, 0); root.add(hipL);
  const hipR = new THREE.Group(); hipR.position.set(.12, .78, 0); root.add(hipR);
  function segment(parent, radius, length, material, y) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), material);
    m.position.y = -length * .34 + y; parent.add(m); return m;
  }
  const legL = segment(hipL, .078, .48, shorts, -.23);
  const legR = segment(hipR, .078, .48, shorts, -.23);
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(.17, .1, .29), shoes);
  shoeL.position.set(0, -.48, -.06); hipL.add(shoeL);
  const shoeR = shoeL.clone(); hipR.add(shoeR);
  const shoulderL = new THREE.Group(); shoulderL.position.set(-.29, 1.48, 0); root.add(shoulderL);
  const shoulderR = new THREE.Group(); shoulderR.position.set(.29, 1.48, 0); root.add(shoulderR);
  const upperL = new THREE.Mesh(new THREE.CapsuleGeometry(.064, .25, 4, 8), skin);
  upperL.position.set(0, -.17, 0); shoulderL.add(upperL);
  const upperR = upperL.clone(); upperR.position.set(0, -.17, 0); shoulderR.add(upperR);
  const elbowL = new THREE.Group(); elbowL.position.set(0, -.32, 0); shoulderL.add(elbowL);
  const elbowR = new THREE.Group(); elbowR.position.set(0, -.32, 0); shoulderR.add(elbowR);
  const foreL = new THREE.Mesh(new THREE.CapsuleGeometry(.052, .22, 4, 8), skin);
  foreL.position.y = -.15; elbowL.add(foreL);
  const foreR = foreL.clone(); elbowR.add(foreR);
  const paddle = new THREE.Group(); paddle.position.set(0, -.34, -.02); elbowR.add(paddle);
  const paddleFace = new THREE.Mesh(new THREE.BoxGeometry(.29, .39, .045),
    new THREE.MeshStandardMaterial({ color: 0x253a2d, roughness: .48, metalness: .12 }));
  paddle.add(paddleFace);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(.027, .027, .25, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8dfd3 }));
  grip.position.y = -.29; paddle.add(grip);
  // Name decal faces the camera from the back of the player's jersey.
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(.42, .14),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
  label.position.set(0, 1.34, .246); root.add(label);
  root.userData = { playerId: p.id, torso, hipL, hipR, shoulderL, shoulderR, elbowL, elbowR,
    paddle, label, ctx, tex, idle: Math.random() * Math.PI * 2 };
  root.position.set(p.x, 0, p.z); root.rotation.y = p.rotation || 0;
  return root;
}

function addCourt() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(42, 52),
    new THREE.MeshStandardMaterial({ color: 0x17251e, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.12; S.scene.add(floor);
  const court = new THREE.Mesh(new THREE.BoxGeometry(COURT.width, .12, COURT.length),
    new THREE.MeshStandardMaterial({ color: 0x347a54, roughness: .9 }));
  court.position.y = -.04; S.scene.add(court);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8f1df, roughness: .7 });
  function line(x, z, w, d) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, .018, d), lineMat);
    m.position.set(x, .03, z); S.scene.add(m);
  }
  line(0, -COURT.halfL, COURT.width, .035); line(0, COURT.halfL, COURT.width, .035);
  line(-COURT.halfW, 0, .035, COURT.length); line(COURT.halfW, 0, .035, COURT.length);
  line(0, -COURT.kitchen, COURT.width, .035); line(0, COURT.kitchen, COURT.width, .035);
  line(0, 0, .035, COURT.length); line(-COURT.halfW / 2, 0, .025, COURT.length);
  line(COURT.halfW / 2, 0, .025, COURT.length);
  const netGroup = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0xe7eee3 });
  for (const x of [-3.18, 3.18]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 1.05, 10), postMat);
    post.position.set(x, .52, 0); netGroup.add(post);
  }
  const net = new THREE.Mesh(new THREE.BoxGeometry(6.3, .83, .045),
    new THREE.MeshStandardMaterial({ color: 0x17221c, transparent: true, opacity: .9, wireframe: true }));
  net.position.y = .53; netGroup.add(net);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(6.35, .07, .08), postMat);
  tape.position.y = .98; netGroup.add(tape); S.scene.add(netGroup);
  const signCanvas = document.createElement("canvas"); signCanvas.width = 512; signCanvas.height = 128;
  const ctx = signCanvas.getContext("2d"); ctx.fillStyle = "#dff2d0"; ctx.font = "900 80px Arial";
  ctx.textAlign = "center"; ctx.fillText("YOLO", 256, 88);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.5, .62),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCanvas), transparent: true, side: THREE.DoubleSide }));
  sign.position.set(0, .04, 2.8); S.scene.add(sign);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x33483a });
  for (const z of [-8, 8]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(11, .15, .15), railMat);
    rail.position.set(0, .5, z); S.scene.add(rail);
  }
  for (const x of [-5.5, 5.5]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.15, .15, 16), railMat);
    rail.position.set(x, .5, 0); S.scene.add(rail);
  }
}
function initScene() {
  const stage = $("#gameStage");
  S.scene = new THREE.Scene();
  S.scene.background = new THREE.Color(0x14271c);
  S.scene.fog = new THREE.Fog(0x14271c, 20, 38);
  S.camera = new THREE.PerspectiveCamera(43, stage.clientWidth / stage.clientHeight, .1, 100);
  S.camera.position.set(0, 11, 17.5); S.camera.lookAt(0, 0, 0);
  S.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  S.renderer.setSize(stage.clientWidth, stage.clientHeight);
  S.renderer.shadowMap.enabled = true; S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  S.renderer.outputColorSpace = THREE.SRGBColorSpace;
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping; S.renderer.toneMappingExposure = 1.1;
  stage.insertBefore(S.renderer.domElement, stage.querySelector(".scene-hint"));
  S.scene.add(new THREE.HemisphereLight(0xdcebd9, 0x233729, 2));
  const key = new THREE.DirectionalLight(0xfff1d8, 2.5);
  key.position.set(-5, 12, 7); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); S.scene.add(key);
  const fill = new THREE.DirectionalLight(0xb2d8c2, 1); fill.position.set(6, 7, -8); S.scene.add(fill);
  addCourt();
  S.ball = new THREE.Mesh(new THREE.SphereGeometry(.105, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xdfff55, roughness: .5, emissive: 0x536b13, emissiveIntensity: .25 }));
  S.ball.castShadow = true; S.ball.position.set(0, .12, 3.7); S.scene.add(S.ball);
  S.velocity = new THREE.Vector3();
  updateMeshes(); resizeRenderer();
  $("#loadingScene").classList.add("done");
  setTimeout(() => $("#loadingScene").remove(), 500);
  S.clock.start(); animate();
}
function resizeRenderer() {
  if (!S.renderer) return;
  const stage = $("#gameStage"); if (!stage) return;
  const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  S.camera.aspect = w / h; S.camera.updateProjectionMatrix(); S.renderer.setSize(w, h, false);
}
window.addEventListener("resize", resizeRenderer);
function animate() {
  if (!S.renderer) return;
  requestAnimationFrame(animate);
  const dt = Math.min(S.clock.getDelta(), .033);
  updateGame(dt);
  S.renderer.render(S.scene, S.camera);
}
function animatePlayer(p, dt, time) {
  if (!p.mesh) return;
  const q = p.mesh.userData;
  const moving = p.moving || 0;
  const phase = time * 10 + q.idle;
  const run = Math.sin(phase) * moving * .55;
  q.hipL.rotation.x = run; q.hipR.rotation.x = -run;
  q.shoulderL.rotation.x = -run * .35;
  q.shoulderR.rotation.x = run * .35;
  q.torso.rotation.z = Math.sin(time * 2.2 + q.idle) * .012;
  if (p.swing > 0) {
    p.swing = Math.max(0, p.swing - dt * 2.8);
    const a = Math.sin((1 - p.swing) * Math.PI);
    const type = p.swingType;
    q.shoulderR.rotation.x = type === "lob" || type === "smash" ? -1.7 * a : -.7 * a;
    q.shoulderR.rotation.z = (type === "slice" ? -1.1 : .9) * a;
    q.elbowR.rotation.x = -1.0 * a;
    q.paddle.rotation.z = (type === "slice" ? -.9 : .35) * a;
  } else {
    q.shoulderR.rotation.z = .08;
    q.elbowR.rotation.x = 0;
    q.paddle.rotation.z = 0;
  }
}
function updateGame(dt) {
  S.cooldown = Math.max(0, S.cooldown - dt);
  const time = performance.now() / 1000;
  const local = S.players.find(p => p.id === S.id);
  if (local) {
    let dx = 0, dz = 0;
    if (S.keys.has("a") || S.keys.has("arrowleft")) dx -= 1;
    if (S.keys.has("d") || S.keys.has("arrowright")) dx += 1;
    if (S.keys.has("w") || S.keys.has("arrowup")) dz -= 1;
    if (S.keys.has("s") || S.keys.has("arrowdown")) dz += 1;
    dx += S.joy.x; dz += S.joy.z;
    const orientation = local.team === 0 ? 1 : -1;
    dz *= orientation;
    const magnitude = Math.hypot(dx, dz);
    if (magnitude > 1) { dx /= magnitude; dz /= magnitude; }
    const speed = 4.5;
    local.x = THREE.MathUtils.clamp(local.x + dx * speed * dt, -2.55, 2.55);
    local.z = local.team === 0
      ? THREE.MathUtils.clamp(local.z + dz * speed * dt, 1.1, 6.05)
      : THREE.MathUtils.clamp(local.z + dz * speed * dt, -6.05, -1.1);
    if (magnitude > .08) local.rotation = Math.atan2(dx, dz);
    local.moving = magnitude;
    if (local.mesh) {
      local.mesh.position.set(local.x, 0, local.z);
      local.mesh.rotation.y = local.rotation || 0;
    }
    if (S.mode === "online" && !S.host && performance.now() - S.lastNet > 55) {
      sendToHost({ type: "input", x: local.x, z: local.z, rotation: local.rotation });
      S.lastNet = performance.now();
    }
  }
  for (const p of S.players) {
    if (p.targetX !== null && p.id !== S.id) {
      p.x = THREE.MathUtils.damp(p.x, p.targetX, 12, dt);
      p.z = THREE.MathUtils.damp(p.z, p.targetZ, 12, dt);
      p.rotation = THREE.MathUtils.damp(p.rotation || 0, p.targetRotation || 0, 10, dt);
      if (p.mesh) { p.mesh.position.set(p.x, 0, p.z); p.mesh.rotation.y = p.rotation; }
    }
    if (p.bot && S.hostOrTraining && S.phase === "rally") updateBot(p, dt);
    animatePlayer(p, dt, time);
  }
  if (S.ball && (S.host || S.mode === "training")) simulateBall(dt);
  if (S.mode === "online" && S.host && performance.now() - S.lastSnapshot > 45) {
    broadcastSnapshot(); S.lastSnapshot = performance.now();
  }
}
Object.defineProperty(S, "hostOrTraining", { get() { return S.host || S.mode === "training"; } });

function updateBot(p, dt) {
  if (!S.ball || !S.velocity) return;
  const ballSide = S.ball.position.z >= 0 ? 0 : 1;
  if (ballSide !== p.team) return;
  const targetX = THREE.MathUtils.clamp(S.ball.position.x * .9, -2.35, 2.35);
  const targetZ = p.team === 0
    ? THREE.MathUtils.clamp(S.ball.position.z + .8, 1.2, 5.9)
    : THREE.MathUtils.clamp(S.ball.position.z - .8, -5.9, -1.2);
  p.x = THREE.MathUtils.damp(p.x, targetX, 2.8, dt);
  p.z = THREE.MathUtils.damp(p.z, targetZ, 2.8, dt);
  p.moving = Math.min(1, Math.hypot(targetX - p.x, targetZ - p.z));
  if (p.mesh) { p.mesh.position.set(p.x, 0, p.z); p.mesh.rotation.y = p.team === 0 ? 0 : Math.PI; }
  p.botThink = Math.max(0, p.botThink - dt);
  const dist = Math.hypot(S.ball.position.x - p.x, S.ball.position.z - p.z);
  if (dist < 1.45 && p.botThink <= 0 && S.expectedBounceTeam !== p.team && S.cooldown <= 0) {
    p.botThink = 1.1;
    const choices = ["dink", "slice", "drive", "lob"];
    const shot = choices[Math.floor(Math.random() * choices.length)];
    performHit(shot, p.id, true);
  }
}
function simulateBall(dt) {
  if (S.phase !== "rally" || !S.ball || !S.velocity) return;
  const previous = S.ball.position.clone();
  S.velocity.y -= 9.81 * dt;
  S.ball.position.addScaledVector(S.velocity, dt);
  // Net collision: the ball must clear the tape while crossing the centre line.
  if ((previous.z < 0 && S.ball.position.z >= 0) || (previous.z > 0 && S.ball.position.z <= 0)) {
    if (S.ball.position.y < .94 && Math.abs(S.ball.position.x) <= COURT.halfW + .1) {
      awardPoint(1 - S.lastHitTeam, "Bóng chạm lưới");
      return;
    }
  }
  // A ball landing beyond the lines is out.
  if (Math.abs(S.ball.position.x) > COURT.halfW + .18 || Math.abs(S.ball.position.z) > COURT.halfL + .18) {
    awardPoint(1 - S.lastHitTeam, "Bóng ra ngoài");
    return;
  }
  if (S.ball.position.y <= .105 && S.velocity.y < 0) {
    S.ball.position.y = .105;
    S.velocity.y = Math.abs(S.velocity.y) * .68;
    if (S.velocity.y < .65) S.velocity.y = 0;
    const side = S.ball.position.z >= 0 ? 0 : 1;
    S.sideBounces[side] += 1;
    if (S.expectedBounceTeam === side) S.expectedBounceTeam = side === 0 ? 1 : null;
    if (S.sideBounces[side] >= 2) {
      awardPoint(1 - side, "Bóng nảy hai lần");
      return;
    }
    $("#gameStatus").textContent = S.expectedBounceTeam === null
      ? "DOUBLE BOUNCE RULE ĐÃ HOÀN TẤT · Có thể volley"
      : "Bóng đã nảy · Tiếp tục pha bóng";
  }
  if (S.mode === "online" && S.host && S.velocity.lengthSq() < .05) {
    awardPoint(1 - S.lastHitTeam, "Bóng không được trả lại");
  }
}
function startServe() {
  if (S.mode === "online" && !S.host) {
    sendToHost({ type: "serve" }); return;
  }
  if (S.phase !== "ready") { toast("Pha bóng hiện tại chưa kết thúc."); return; }
  const teamPlayers = S.players.filter(p => p.team === S.servingTeam);
  if (!teamPlayers.length) { toast("Đang chờ người giao bóng của đội."); return; }
  const server = teamPlayers[S.serverIndex % teamPlayers.length];
  const direction = server.team === 0 ? -1 : 1;
  if (server.team === 0) {
    server.x = server.x < 0 ? -1.9 : 1.9;
    server.z = 5.95;
  } else {
    server.x = server.x < 0 ? -1.9 : 1.9;
    server.z = -5.95;
  }
  if (server.mesh) server.mesh.position.set(server.x, 0, server.z);
  const targetX = -server.x * .55;
  S.ball.position.set(server.x, 1.25, server.z - direction * .15);
  S.velocity.set((targetX - server.x) * .65, 5.4, direction * 10.4);
  S.phase = "rally"; S.rally = 0; S.sideBounces = [0, 0];
  S.expectedBounceTeam = 1 - server.team;
  S.lastHitTeam = server.team; S.cooldown = .25;
  $("#gameStatus").textContent = "SERVE · Giao chéo sân, bóng phải nảy trước khi trả";
  syncScore();
  if (server.id !== S.id) toast("Đội đối phương giao bóng.");
}
function attemptShot(shot, playerId = S.id) {
  if (S.mode === "online" && !S.host) {
    sendToHost({ type: "shot", shot, playerId: S.id });
    return;
  }
  performHit(shot, playerId, false);
}
function performHit(shot, playerId, fromBot) {
  if (S.phase !== "rally" || S.cooldown > 0) return;
  const p = S.players.find(x => x.id === playerId);
  if (!p || !S.ball) return;
  const ballSide = S.ball.position.z >= 0 ? 0 : 1;
  if (ballSide !== p.team) {
    if (!fromBot) toast("Bóng đang ở phần sân đối phương.");
    return;
  }
  const distance = Math.hypot(S.ball.position.x - p.x, S.ball.position.z - p.z);
  if (distance > 2.15 || S.ball.position.y > 3.4) {
    if (!fromBot) toast("Di chuyển đến gần bóng hơn để thực hiện cú đánh.");
    return;
  }
  if (S.expectedBounceTeam === p.team) {
    awardPoint(1 - p.team, "Vi phạm luật bóng phải nảy");
    return;
  }
  // Volleying while standing in the non-volley zone is a fault.
  const inKitchen = p.team === 0 ? p.z < COURT.kitchen : p.z > -COURT.kitchen;
  const ballHasBounced = S.sideBounces[p.team] > 0 || S.expectedBounceTeam === null;
  if (shot === "volley" && inKitchen && !ballHasBounced) {
    awardPoint(1 - p.team, "Volley trong vùng Kitchen");
    return;
  }
  const spec = SHOTS[shot] || SHOTS.drive;
  const direction = p.team === 0 ? -1 : 1;
  const targetX = THREE.MathUtils.clamp(-p.x * .55 + (Math.random() - .5) * 1.8, -2.5, 2.5);
  const lateral = (targetX - S.ball.position.x) * .45;
  S.velocity.set(lateral + (shot === "slice" ? .8 : 0), spec.lift, direction * spec.speed);
  S.ball.position.y = Math.max(S.ball.position.y, .32);
  S.lastHitTeam = p.team;
  S.sideBounces = [0, 0];
  S.cooldown = .3;
  p.swing = 1; p.swingType = shot;
  p.rotation = Math.atan2(targetX - p.x, direction);
  if (p.mesh) p.mesh.rotation.y = p.rotation;
  S.rally++;
  $("#gameStatus").textContent = spec.label;
  syncScore();
}
function awardPoint(winner, reason) {
  if (S.phase !== "rally") return;
  S.phase = "point";
  S.velocity.set(0, 0, 0);
  if (winner === S.servingTeam) {
    S.score[winner] += 1;
    const teammates = S.players.filter(p => p.team === winner);
    if (teammates.length > 1) S.serverIndex = (S.serverIndex + 1) % teammates.length;
  } else {
    S.servingTeam = winner;
    S.serverIndex = 0;
  }
  const won = S.score[winner] >= 11 && S.score[winner] - S.score[1 - winner] >= 2;
  $("#gameStatus").textContent = (winner === 0 ? "TEAM YOLO" : "OPPONENT") + " THẮNG PHA BÓNG · " + reason;
  syncScore();
  if (won) {
    S.phase = "finished";
    $("#gameStatus").textContent = "MATCH POINT · " + (winner === 0 ? "TEAM YOLO" : "OPPONENT") + " CHIẾN THẮNG";
    toast("Trận đấu kết thúc. Đội thắng: " + (winner === 0 ? "YOLO" : "Đối thủ"));
    return;
  }
  if (S.mode === "online" && !S.host) return;
  clearTimeout(S.pointTimer);
  S.pointTimer = setTimeout(() => {
    if (S.phase !== "point") return;
    S.phase = "ready";
    const next = S.players.filter(p => p.team === S.servingTeam)[S.serverIndex % Math.max(1, S.players.filter(p => p.team === S.servingTeam).length)];
    if (next) S.ball.position.set(next.x, .12, next.z - (next.team === 0 ? .2 : -.2));
    syncScore();
    $("#gameStatus").textContent = "ĐIỂM ĐÃ KẾT THÚC · Nhấn SERVE để giao bóng tiếp";
  }, 1700);
}
function selectShot(shot) {
  S.shot = shot;
  $$(".shot-button").forEach(b => b.classList.toggle("selected", b.dataset.shot === shot));
  $("#gameStatus").textContent = shot.toUpperCase() + " SELECTED · Nhấn lại nút kỹ thuật để đánh bóng";
}
$$("[data-shot]").forEach(btn => btn.addEventListener("click", () => {
  const shot = btn.dataset.shot;
  if (S.shot === shot) attemptShot(shot);
  else selectShot(shot);
}));
$("#serveButton").onclick = startServe;
$$("[data-action='serve']").forEach(btn => btn.onclick = startServe);
$("#gameStage").addEventListener("pointerdown", e => {
  if (e.target.closest("button") || e.target.closest(".joystick")) return;
  attemptShot(S.shot);
});
window.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) e.preventDefault();
  S.keys.add(key);
  const shotKeys = { "1": "dink", "2": "slice", "3": "lob", "4": "volley", "5": "drive", "6": "smash" };
  if (shotKeys[key] && !e.repeat) selectShot(shotKeys[key]);
  if (key === " " && !e.repeat) attemptShot(S.shot);
});
window.addEventListener("keyup", e => S.keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => S.keys.clear());
const joystick = $("#joystick"), knob = $("#joystickKnob");
let joyPointer = null;
function moveJoystick(e) {
  const r = joystick.getBoundingClientRect();
  let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
  const max = 32, len = Math.hypot(x, y);
  if (len > max) { x = x / len * max; y = y / len * max; }
  knob.style.transform = "translate(" + x + "px," + y + "px)";
  S.joy.x = x / max; S.joy.z = y / max;
}
joystick.addEventListener("pointerdown", e => { joyPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); moveJoystick(e); });
joystick.addEventListener("pointermove", e => { if (joyPointer === e.pointerId) moveJoystick(e); });
function resetJoystick(e) {
  if (joyPointer !== e.pointerId) return;
  joyPointer = null; knob.style.transform = ""; S.joy.x = 0; S.joy.z = 0;
}
joystick.addEventListener("pointerup", resetJoystick);
joystick.addEventListener("pointercancel", resetJoystick);

function sendToHost(message) {
  for (const conn of S.conns.values()) if (conn.open) conn.send(message);
}
function broadcastSnapshot() {
  if (!S.host) return;
  const snapshot = {
    type: "snapshot",
    players: S.players.map(p => ({ id: p.id, name: p.name, color: p.color, x: p.x, z: p.z,
      rotation: p.rotation, team: p.team, slot: p.slot })),
    score: S.score, servingTeam: S.servingTeam, serverIndex: S.serverIndex,
    rally: S.rally, phase: S.phase, expectedBounceTeam: S.expectedBounceTeam,
    sideBounces: S.sideBounces,
    ball: S.ball ? { x: S.ball.position.x, y: S.ball.position.y, z: S.ball.position.z,
      vx: S.velocity.x, vy: S.velocity.y, vz: S.velocity.z } : null,
    status: $("#gameStatus").textContent
  };
  sendToHost(snapshot);
}
function attachConnection(conn, isGuest) {
  conn.on("open", () => {
    S.conns.set(conn.peer, conn);
    if (isGuest) {
      conn.send({ type: "join", name: S.name, color: S.color });
    } else {
      const player = S.players.find(p => p.id === conn.peer);
      if (player) conn.send({ type: "welcome", players: S.players, score: S.score,
        servingTeam: S.servingTeam, serverIndex: S.serverIndex, hostId: S.id });
      broadcastSnapshot();
    }
  });
  conn.on("data", message => {
    if (!message || !message.type) return;
    if (message.type === "join" && S.host) {
      const player = S.players.find(p => p.id === conn.peer);
      if (player) { player.name = cleanName(message.name); player.color = message.color || "#70c5e8"; }
      conn.send({ type: "welcome", players: S.players, score: S.score,
        servingTeam: S.servingTeam, serverIndex: S.serverIndex, hostId: S.id });
      updateMeshes(); broadcastSnapshot();
    } else if (message.type === "input" && S.host) {
      const player = S.players.find(p => p.id === conn.peer);
      if (player) {
        player.targetX = THREE.MathUtils.clamp(message.x, -2.55, 2.55);
        player.targetZ = player.team === 0
          ? THREE.MathUtils.clamp(message.z, 1.1, 6.05)
          : THREE.MathUtils.clamp(message.z, -6.05, -1.1);
        player.targetRotation = message.rotation || 0;
      }
    } else if (message.type === "shot" && S.host) {
      performHit(message.shot, conn.peer, false);
    } else if (message.type === "serve" && S.host) {
      startServe();
    } else if (message.type === "welcome" && !S.host) {
      S.players = message.players || S.players;
      S.score = message.score || [0, 0];
      S.servingTeam = message.servingTeam || 0;
      S.serverIndex = message.serverIndex || 0;
      syncScore(); updateMeshes();
    } else if (message.type === "snapshot" && !S.host) {
      S.players = message.players || S.players;
      S.score = message.score || S.score;
      S.servingTeam = message.servingTeam ?? S.servingTeam;
      S.serverIndex = message.serverIndex ?? S.serverIndex;
      S.rally = message.rally ?? S.rally;
      S.phase = message.phase || S.phase;
      S.expectedBounceTeam = message.expectedBounceTeam;
      S.sideBounces = message.sideBounces || [0, 0];
      if (message.ball && S.ball) {
        S.ball.position.set(message.ball.x, message.ball.y, message.ball.z);
        S.velocity.set(message.ball.vx || 0, message.ball.vy || 0, message.ball.vz || 0);
      }
      $("#gameStatus").textContent = message.status || "";
      syncScore(); updateMeshes();
    } else if (message.type === "full") {
      toast("Phòng đã đủ 4 người."); conn.close();
    }
  });
  conn.on("close", () => {
    S.conns.delete(conn.peer);
    if (S.host) {
      S.players = S.players.filter(p => p.id !== conn.peer);
      updateMeshes(); broadcastSnapshot();
    }
  });
  conn.on("error", error => console.warn("Peer connection error", error));
}
function leaveNetwork() {
  clearTimeout(S.pointTimer);
  for (const conn of S.conns.values()) try { conn.close(); } catch {}
  S.conns.clear();
  if (S.peer) { try { S.peer.destroy(); } catch {} S.peer = null; }
  S.host = false; S.networkReady = false;
}
function startTraining() {
  leaveNetwork();
  S.mode = "training"; S.code = "TRAINING"; S.id = "local";
  S.players = [
    { ...createPlayer(0, "local", S.name, S.color), local: true },
    { ...createPlayer(1, "bot1", "YOLO BOT", "#70c5e8"), bot: true },
    { ...createPlayer(2, "bot2", "RIVAL 01", "#ed9b9b"), bot: true },
    { ...createPlayer(3, "bot3", "RIVAL 02", "#ed9b9b"), bot: true }
  ];
  S.score = [0, 0]; S.servingTeam = 0; S.serverIndex = 0; S.rally = 0;
  S.phase = "ready"; S.expectedBounceTeam = null; S.sideBounces = [0, 0];
  syncScore(); $("#roomCodeLabel").textContent = "TRAINING";
  $("#networkLabel").textContent = "CHẾ ĐỘ LUYỆN TẬP";
  $("#gameStatus").textContent = "SẴN SÀNG · Nhấn SERVE để bắt đầu";
  updateMeshes(); showScreen(true);
}
function createRoom() {
  leaveNetwork();
  S.mode = "online"; S.host = true; S.code = String(Math.floor(1000 + Math.random() * 9000));
  S.id = "host";
  S.players = [createPlayer(0, S.id, S.name, S.color)];
  S.score = [0, 0]; S.servingTeam = 0; S.serverIndex = 0; S.rally = 0;
  S.phase = "ready"; S.expectedBounceTeam = null; S.sideBounces = [0, 0];
  syncScore(); $("#roomCodeLabel").textContent = "YOLO-" + S.code;
  $("#networkLabel").textContent = "ĐANG TẠO PHÒNG";
  $("#gameStatus").textContent = "Đang kết nối dịch vụ phòng...";
  updateMeshes(); showScreen(true);
  if (!window.Peer) { toast("Không tải được dịch vụ kết nối."); return; }
  S.peer = new Peer("yolo-pb-" + S.code, { debug: 0 });
  S.peer.on("open", id => {
    S.id = id;
    const host = S.players.find(p => p.slot === 0); if (host) host.id = id;
    updateMeshes();
    S.networkReady = true;
    $("#networkLabel").textContent = "PHÒNG ONLINE";
    $("#gameStatus").textContent = "PHÒNG ĐÃ MỞ · Chia sẻ mã YOLO-" + S.code;
    toast("Đã tạo phòng YOLO-" + S.code);
  });
  S.peer.on("connection", conn => {
    if (S.players.length >= 4) {
      conn.on("open", () => conn.send({ type: "full" }));
      setTimeout(() => conn.close(), 500); return;
    }
    const slot = [0, 1, 2, 3].find(i => !S.players.some(p => p.slot === i));
    S.players.push(createPlayer(slot, conn.peer, "PLAYER", slot < 2 ? "#70c5e8" : "#ed9b9b"));
    attachConnection(conn, false);
  });
  S.peer.on("error", error => {
    console.warn(error); $("#gameStatus").textContent = "Kết nối phòng lỗi: " + error.type;
    toast("Không thể mở phòng: " + error.type);
  });
}
function joinRoom() {
  const code = $("#joinCodeInput").value.replace(/[^0-9]/g, "").slice(0, 4);
  if (code.length !== 4) { toast("Mã phòng cần đủ 4 chữ số."); return; }
  leaveNetwork();
  S.mode = "online"; S.host = false; S.code = code; S.id = "joining";
  S.players = [createPlayer(0, S.id, S.name, S.color)];
  S.score = [0, 0]; S.servingTeam = 0; S.serverIndex = 0; S.phase = "ready";
  $("#roomCodeLabel").textContent = "YOLO-" + code;
  $("#networkLabel").textContent = "ĐANG KẾT NỐI";
  $("#gameStatus").textContent = "Đang kết nối chủ phòng...";
  updateMeshes(); $("#joinModal").hidden = true; showScreen(true);
  if (!window.Peer) { toast("Không tải được dịch vụ kết nối."); return; }
  S.peer = new Peer({ debug: 0 });
  S.peer.on("open", id => {
    S.id = id;
    S.players[0].id = id;
    const conn = S.peer.connect("yolo-pb-" + code, { reliable: true });
    attachConnection(conn, true);
    updateMeshes();
  });
  S.peer.on("error", error => {
    console.warn(error); $("#gameStatus").textContent = "Không tìm thấy phòng hoặc máy chủ đang bận.";
    toast("Không thể kết nối phòng.");
  });
}

$("#profileButton").onclick = () => { $("#profileNameInput").value = S.name; $("#profileModal").hidden = false; };
$("#closeProfileModal").onclick = () => $("#profileModal").hidden = true;
$("#saveProfileButton").onclick = () => { setName($("#profileNameInput").value); $("#profileModal").hidden = true; toast("Đã lưu tên người chơi."); };
$("#jerseyInput").addEventListener("input", e => setName(e.target.value));
$("#rulesButton").onclick = () => $("#rulesModal").hidden = false;
$("#closeRulesModal").onclick = () => $("#rulesModal").hidden = true;
$("#modeJoin").onclick = () => $("#joinModal").hidden = false;
$("#closeJoinModal").onclick = () => $("#joinModal").hidden = true;
$("#joinRoomButton").onclick = joinRoom;
$("#joinCodeInput").addEventListener("keydown", e => { if (e.key === "Enter") joinRoom(); });
$("#modeOnline").onclick = $("#createRoomButton").onclick = createRoom;
$("#modePractice").onclick = $("#trainingButton").onclick = startTraining;
$("#backHomeButton").onclick = () => { leaveNetwork(); showScreen(false); };
$("#copyRoomButton").onclick = async () => {
  try { await navigator.clipboard.writeText("YOLO-" + S.code); toast("Đã sao chép mã YOLO-" + S.code); }
  catch { toast("Mã phòng: YOLO-" + S.code); }
};
$$(".color-dot").forEach(btn => btn.onclick = () => {
  $$(".color-dot").forEach(x => x.classList.remove("selected"));
  btn.classList.add("selected"); S.color = btn.dataset.color;
  document.documentElement.style.setProperty("--shirt", S.color);
  const local = S.players.find(p => p.id === S.id); if (local) local.color = S.color;
  updatePlayerLabels();
});
document.addEventListener("visibilitychange", () => { if (document.hidden) S.keys.clear(); });
setName(S.name);
syncPlayerUI();
