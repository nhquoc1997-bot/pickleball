import * as THREE from "three";
import {
  loadAthleteTemplate,
  createRiggedAvatar,
  updateRiggedAvatar,
  animateRiggedAvatar
} from "./avatar-rig.js";
import {
  isInKitchen,
  isValidServeLanding,
  nextServeState,
  isMatchWon
} from "./rules.mjs";
import {
  assignDoublesRoles,
  chooseBotShot,
  shouldBotContestBall
} from "./ai-strategy.mjs";
import {
  RECONNECT_GRACE_MS,
  findResumablePlayer,
  findAvailableSlot,
  expireDisconnectedPlayers,
  roomPresence
} from "./room-state.mjs";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const COURT = { width: 6.1, length: 13.41, halfW: 3.05, halfL: 6.705, kitchen: 2.13 };
const SHOTS = {
  dink:   { speed: 4.7, lift: 3.1, topspin: 1.5, sidespin: 0, label: "DINK · Bóng mềm qua kitchen" },
  slice:  { speed: 6.5, lift: 2.0, topspin: -2.2, sidespin: 8.5, label: "SLICE · Cắt bóng tạo xoáy" },
  lob:    { speed: 5.3, lift: 7.6, topspin: -1.2, sidespin: .5, label: "LOB · Bóng bổng qua đầu" },
  volley: { speed: 8.4, lift: 2.6, topspin: 3.5, sidespin: 0, label: "VOLLEY · Đánh bóng trên không" },
  drive:  { speed: 10.0, lift: 2.2, topspin: 8.5, sidespin: .8, label: "DRIVE · Đánh nhanh" },
  smash:  { speed: 12.0, lift: 3.3, topspin: 12, sidespin: 0, label: "SMASH · Đập bóng" }
};
const S = {
  name: "YOLO PLAYER", color: "#c7f36b", mode: "training", code: "TRAINING",
  peer: null, conns: new Map(), host: false, networkReady: false,
  players: [], id: "local", keys: new Set(), joy: { x: 0, z: 0 },
  score: [0, 0], servingTeam: 0, serverIndex: 1, serverNumber: 2, rally: 0,
  phase: "ready", expectedBounceTeam: null, twoBounceStep: 0, serveActive: false, sideBounces: [0, 0],
  ballBouncedSinceHit: false, serveNetContact: false, matchWinner: null,
  lastHitTeam: 0, ball: null, velocity: null, spin: null, magnus: null, shot: "drive", cooldown: 0,
  scene: null, camera: null, renderer: null, clock: new THREE.Clock(),
  rigTemplate: null, rigLoading: false, rigLoadFailed: false,
  lastNet: 0, lastSnapshot: 0, pointTimer: null, disposed: false,
  inputSeq: 0, lastSnapshotSeq: 0, snapshotSeq: 0, lastPingAt: 0,
  lastHostMessageAt: 0, rtt: 0, netBallTarget: null,
  networkSession: 0, connectionLost: false,
  hostPeerId: null, resumeToken: null, reconnectTimer: null, reconnectAttempts: 0
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
  const servingScore = S.score[S.servingTeam] ?? 0;
  const receivingScore = S.score[1 - S.servingTeam] ?? 0;
  const final = S.phase === "finished";
  $("#scoreCallLabel").textContent = final ? "MATCH FINAL" : "OFFICIAL SCORE CALL";
  $("#rallyLabel").textContent = final
    ? String(S.score[0]) + " – " + String(S.score[1])
    : servingScore + " – " + receivingScore + " – " + S.serverNumber;
  const teamPlayers = S.players.filter(p => p.team === S.servingTeam);
  const server = teamPlayers[S.serverIndex % Math.max(1, teamPlayers.length)];
  $("#serverNameLabel").textContent = final
    ? "WINNER: " + (S.matchWinner === 0 ? "TEAM YOLO" : "OPPONENT")
    : "SERVER " + S.serverNumber + (server ? " · " + server.name : "");
  const scoreTeams = document.querySelectorAll(".score-team");
  scoreTeams[0]?.classList.toggle("active-team", S.servingTeam === 0);
  scoreTeams[1]?.classList.toggle("active-team", S.servingTeam === 1);
}
function cleanName(value) {
  return (value || "YOLO PLAYER").trim().replace(/[<>]/g, "").slice(0, 14).toUpperCase() || "YOLO PLAYER";
}
function loadSavedProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem("yolo-pickleball-profile") || "null");
    if (saved && typeof saved === "object") {
      if (typeof saved.name === "string") S.name = cleanName(saved.name);
      if (typeof saved.color === "string" && /^#[0-9a-f]{6}$/i.test(saved.color)) S.color = saved.color;
    }
  } catch {}
}
function saveProfile() {
  try { localStorage.setItem("yolo-pickleball-profile", JSON.stringify({ name: S.name, color: S.color })); }
  catch {}
}
function makeResumeToken() {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
}
function saveRoomResume() {
  if (!S.code || !S.resumeToken) return;
  try {
    localStorage.setItem("yolo-pickleball-room-resume", JSON.stringify({
      code: S.code, hostPeerId: S.hostPeerId, token: S.resumeToken
    }));
  } catch {}
}
function loadRoomResume(code) {
  try {
    const saved = JSON.parse(localStorage.getItem("yolo-pickleball-room-resume") || "null");
    return saved?.code === code && typeof saved.token === "string" ? saved : null;
  } catch { return null; }
}
function clearRoomResume() {
  try { localStorage.removeItem("yolo-pickleball-room-resume"); } catch {}
}
function scheduleReconnect() {
  if (S.host || S.mode !== "online" || !S.peer || !S.hostPeerId || S.networkReady) return;
  if (S.reconnectAttempts >= 5) {
    $("#reconnectButton").hidden = false;
    $("#networkLabel").textContent = "CẦN KẾT NỐI LẠI";
    $("#gameStatus").textContent = "Chưa thể kết nối lại. Nhấn KẾT NỐI LẠI để thử tiếp.";
    return;
  }
  const delays = [900, 1600, 2800, 4500, 7000];
  const delay = delays[S.reconnectAttempts++];
  clearTimeout(S.reconnectTimer);
  S.reconnectTimer = setTimeout(() => {
    if (S.networkReady || !S.connectionLost || !S.peer || !S.hostPeerId) return;
    const conn = S.peer.connect(S.hostPeerId, { reliable: true });
    attachConnection(conn, true);
  }, delay);
}
function reconnectRoom() {
  if (S.mode !== "online" || S.host) return;
  if (!S.peer || !S.hostPeerId) {
    toast("Hãy quay về sảnh và tham gia lại bằng mã phòng cũ.");
    return;
  }
  clearTimeout(S.reconnectTimer);
  S.reconnectTimer = null;
  S.reconnectAttempts = 0;
  S.connectionLost = true;
  $("#reconnectButton").hidden = true;
  $("#networkLabel").textContent = "ĐANG KẾT NỐI LẠI";
  $("#gameStatus").textContent = "Đang khôi phục vị trí và trạng thái trận đấu...";
  const conn = S.peer.connect(S.hostPeerId, { reliable: true });
  attachConnection(conn, true);
}
function setName(value) {
  S.name = cleanName(value);
  saveProfile();
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
  syncScore();
}
function syncPlayerUI() {
  const list = $("#playerList");
  list.innerHTML = "";
  const ordered = [...S.players].sort((a, b) => a.slot - b.slot);
  const presence = roomPresence(ordered);
  for (let i = 0; i < 4; i++) {
    const p = ordered[i];
    const row = document.createElement("div");
    row.className = "player-row" + (!p ? " waiting" : p.connected === false ? " offline" : "");
    const dot = document.createElement("span"); dot.className = "player-dot";
    const name = document.createElement("b"); name.textContent = p ? p.name : "Đang chờ người chơi";
    const role = document.createElement("small");
    role.textContent = !p ? String(i + 1).padStart(2, "0")
      : p.connected === false ? "OFFLINE"
      : p.id === S.id ? "YOU" : (p.team === 0 ? "TEAM A" : "TEAM B");
    row.append(dot, name, role); list.append(row);
  }
  $("#playerCount").textContent = String(presence.connected).padStart(2, "0") + " / 04";
  $("#playerCount").title = presence.reconnecting
    ? presence.reconnecting + " người đang trong thời gian kết nối lại"
    : "Người chơi đang kết nối";
}
function positionForSlot(slot) {
  // Seat order alternates teams so a room is balanced as players join:
  // host = Team A, first guest = Team B, second guest = Team A, third guest = Team B.
  const team = slot % 2 === 0 ? 0 : 1;
  const x = slot < 2 ? -1.05 : 1.05;
  const z = team === 0 ? 4.65 : -4.65;
  return { team, x, z, rotation: team === 0 ? 0 : Math.PI, slot };
}
function createPlayer(slot, id, name, color) {
  return { id, name: cleanName(name), color: color || "#c7f36b", ...positionForSlot(slot),
    targetX: null, targetZ: null, targetRotation: null, mesh: null, rigged: false,
    velocityX: 0, velocityZ: 0, moving: 0, swing: 0, swingType: "drive", swingSide: "forehand",
    splitStep: 0, lunge: 0, lungeSide: 1, lungeStrength: 1, lungeCooldown: 0,
    volleyFollowThrough: 0, bot: false, botThink: 0,
    connected: true, resumeToken: null, disconnectUntil: 0 };
}
function mergePlayers(incoming, snap = false) {
  const previous = new Map(S.players.map(p => [p.id, p]));
  S.players = (incoming || []).map(data => {
    const existing = previous.get(data.id);
    if (existing) {
      Object.assign(existing, {
        name: data.name, color: data.color, team: data.team, slot: data.slot,
        connected: data.connected !== false,
        swing: data.swing ?? existing.swing ?? 0,
        swingType: data.swingType ?? existing.swingType ?? "drive",
        swingSide: data.swingSide ?? existing.swingSide ?? "forehand",
        splitStep: data.splitStep ?? existing.splitStep ?? 0,
        lunge: data.lunge ?? existing.lunge ?? 0,
        lungeSide: data.lungeSide ?? existing.lungeSide ?? 1,
        lungeStrength: data.lungeStrength ?? existing.lungeStrength ?? 1,
        volleyFollowThrough: data.volleyFollowThrough ?? existing.volleyFollowThrough ?? 0
      });
      if (snap) {
        existing.x = data.x; existing.z = data.z; existing.rotation = data.rotation;
      }
      existing.targetX = data.x; existing.targetZ = data.z; existing.targetRotation = data.rotation;
      return existing;
    }
    return { ...data, targetX: data.x, targetZ: data.z,
      targetRotation: data.rotation, mesh: null, rigged: false,
      velocityX: 0, velocityZ: 0, moving: 0, swing: data.swing || 0,
      swingType: data.swingType || "drive", swingSide: data.swingSide || "forehand",
      splitStep: data.splitStep || 0,
      lunge: data.lunge || 0, lungeSide: data.lungeSide || 1,
      lungeStrength: data.lungeStrength || 1, lungeCooldown: 0,
      volleyFollowThrough: data.volleyFollowThrough || 0,
      connected: data.connected !== false, resumeToken: null, disconnectUntil: 0 };
  });
}
function updatePlayerLabels() {
  for (const p of S.players) {
    if (!p.mesh) continue;
    const q = p.mesh.userData;
    if (q.rigged) {
      updateRiggedAvatar(p.mesh, p);
      continue;
    }
    if (!q.ctx || !q.tex) continue;
    q.ctx.clearRect(0, 0, 512, 256);
    q.ctx.fillStyle = "#142018";
    q.ctx.font = "900 64px Arial";
    q.ctx.textAlign = "center";
    q.ctx.fillText((p.name || "YOLO").slice(0, 14), 256, 160);
    q.tex.needsUpdate = true;
    if (q.torso?.material?.color) q.torso.material.color.set(p.color || "#c7f36b");
  }
}
function updateMeshes() {
  if (!S.scene) return;
  for (const p of S.players) {
    if (!p.mesh) {
      p.mesh = createAvatar(p);
      S.scene.add(p.mesh);
    }
    p.mesh.userData.playerId = p.id;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.rotation || 0;
    if (S.rigTemplate && !p.rigged) upgradePlayerToRigged(p);
  }
  const liveMeshes = new Set(S.players.map(p => p.mesh).filter(Boolean));
  for (const child of [...S.scene.children]) {
    if (child.userData.playerId && !liveMeshes.has(child)) S.scene.remove(child);
  }
  syncPlayerUI();
  updatePlayerLabels();
}

function upgradePlayerToRigged(player) {
  if (!S.scene || !S.rigTemplate || player.rigged) return;
  const oldMesh = player.mesh;
  const rigged = createRiggedAvatar(S.rigTemplate, player);
  S.scene.add(rigged);
  if (oldMesh) {
    S.scene.remove(oldMesh);
    oldMesh.traverse(object => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
      else object.material?.dispose();
    });
  }
  player.mesh = rigged;
  player.rigged = true;
}

async function loadRiggedAthletes() {
  if (S.rigTemplate || S.rigLoading || !S.scene) return;
  S.rigLoading = true;
  const status = $("#avatarLoadingStatus");
  if (status) {
    status.hidden = false;
    status.textContent = "ĐANG TẢI VẬN ĐỘNG VIÊN 3D · 0%";
  }
  try {
    const template = await loadAthleteTemplate(progress => {
      if (status) status.textContent = "ĐANG TẢI VẬN ĐỘNG VIÊN 3D · " + Math.round(progress * 100) + "%";
    });
    S.rigTemplate = template;
    for (const player of S.players) upgradePlayerToRigged(player);
    updatePlayerLabels();
    if (status) {
      status.textContent = "VẬN ĐỘNG VIÊN 3D ĐÃ SẴN SÀNG";
      setTimeout(() => { status.hidden = true; }, 2600);
    }
    $("#gameStatus").textContent = "VẬN ĐỘNG VIÊN 3D ĐÃ SẴN SÀNG · YOLO COURT";
    toast("Đã tải vận động viên 3D.");
  } catch (error) {
    console.warn("YOLO athlete model could not be loaded; using fallback avatars.", error);
    S.rigLoadFailed = true;
    if (status) {
      status.textContent = "KHÔNG TẢI ĐƯỢC MODEL · ĐANG DÙNG NHÂN VẬT DỰ PHÒNG";
      setTimeout(() => { status.hidden = true; }, 5200);
    }
    toast("Không tải được nhân vật 3D; đang dùng bản dự phòng.");
  } finally {
    S.rigLoading = false;
  }
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
  const compactScreen = window.matchMedia("(max-width: 700px)").matches;
  S.camera = new THREE.PerspectiveCamera(compactScreen ? 48 : 43, stage.clientWidth / stage.clientHeight, .1, 100);
  S.camera.position.set(0, compactScreen ? 12.6 : 11, compactScreen ? 20.2 : 17.5);
  S.camera.lookAt(0, 0, 0);
  S.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compactScreen ? 1.2 : 1.6));
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
  S.spin = new THREE.Vector3();
  S.magnus = new THREE.Vector3();
  updateMeshes(); resizeRenderer();
  loadRiggedAthletes();
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
function updateCamera(dt) {
  if (!S.camera) return;
  const local = S.players.find(player => player.id === S.id);
  const side = local?.team === 1 ? -1 : 1;
  const compactScreen = window.matchMedia("(max-width: 700px)").matches;
  const targetX = (local?.x || 0) * .18;
  const targetY = compactScreen ? 12.6 : 11;
  const targetZ = side * (compactScreen ? 20.2 : 17.5);
  S.camera.position.x = THREE.MathUtils.damp(S.camera.position.x, targetX, 2.6, dt);
  S.camera.position.y = THREE.MathUtils.damp(S.camera.position.y, targetY, 2.6, dt);
  S.camera.position.z = THREE.MathUtils.damp(S.camera.position.z, targetZ, 2.6, dt);
  S.camera.lookAt((local?.x || 0) * .1, 0, 0);
}
function animate() {
  if (!S.renderer) return;
  requestAnimationFrame(animate);
  const dt = Math.min(S.clock.getDelta(), .033);
  updateGame(dt);
  updateCamera(dt);
  S.renderer.render(S.scene, S.camera);
}
function animatePlayer(p, dt, time) {
  if (!p.mesh) return;
  if (p.mesh.userData.rigged) {
    animateRiggedAvatar(p.mesh, p, dt, time, S.ball?.position || null);
    return;
  }
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
    local.velocityX = THREE.MathUtils.damp(local.velocityX || 0, dx * speed, 11, dt);
    local.velocityZ = THREE.MathUtils.damp(local.velocityZ || 0, dz * speed, 11, dt);
    local.x = THREE.MathUtils.clamp(local.x + local.velocityX * dt, -2.55, 2.55);
    local.z = local.team === 0
      ? THREE.MathUtils.clamp(local.z + local.velocityZ * dt, 1.1, 7.15)
      : THREE.MathUtils.clamp(local.z + local.velocityZ * dt, -7.15, -1.1);
    if (S.mode === "online" && !S.host && local.targetX !== null) {
      local.x = THREE.MathUtils.damp(local.x, local.targetX, 5, dt);
      local.z = THREE.MathUtils.damp(local.z, local.targetZ, 5, dt);
    }
    if (magnitude > .08) local.rotation = Math.atan2(-dx, -dz);
    local.moving = Math.min(1, Math.hypot(local.velocityX, local.velocityZ) / speed);
    local.lungeCooldown = Math.max(0, (local.lungeCooldown || 0) - dt);
    if (S.ball && S.ball.position.z * (local.team === 0 ? 1 : -1) > 0) {
      const ballDistance = Math.hypot(S.ball.position.x - local.x, S.ball.position.z - local.z);
      if (ballDistance < 1.55 && local.moving > .58 && local.lungeCooldown <= 0) {
        local.lunge = .42;
        local.lungeSide = S.ball.position.x >= local.x ? 1 : -1;
        local.lungeStrength = THREE.MathUtils.clamp((ballDistance - .3) / 1.2, .25, .8);
        local.lungeCooldown = .85;
      }
    }
    if (local.mesh) {
      local.mesh.position.set(local.x, 0, local.z);
      local.mesh.rotation.y = local.rotation || 0;
    }
    if (S.mode === "online" && !S.host && S.networkReady && performance.now() - S.lastNet > 33) {
      sendToHost({ type: "input", seq: ++S.inputSeq, x: local.x, z: local.z, rotation: local.rotation });
      S.lastNet = performance.now();
    }
  }
  for (const p of S.players) {
    if (p.targetX !== null && p.id !== S.id) {
      const previousX = p.x, previousZ = p.z;
      p.x = THREE.MathUtils.damp(p.x, p.targetX, 16, dt);
      p.z = THREE.MathUtils.damp(p.z, p.targetZ, 16, dt);
      p.rotation = THREE.MathUtils.damp(p.rotation || 0, p.targetRotation || 0, 10, dt);
      p.velocityX = dt > 0 ? (p.x - previousX) / dt : 0;
      p.velocityZ = dt > 0 ? (p.z - previousZ) / dt : 0;
      p.moving = Math.min(1, Math.hypot(p.velocityX, p.velocityZ) / 4.5);
      p.lungeCooldown = Math.max(0, (p.lungeCooldown || 0) - dt);
      if (p.mesh) { p.mesh.position.set(p.x, 0, p.z); p.mesh.rotation.y = p.rotation; }
    }
    if (p.volleyFollowThrough > 0) {
      p.volleyFollowThrough = Math.max(0, p.volleyFollowThrough - dt);
      if (S.phase === "rally" && isInKitchen(p)) {
        p.volleyFollowThrough = 0;
        awardPoint(1 - p.team, "Đà sau cú volley đưa người chơi vào Kitchen");
      }
    }
    if (p.bot && S.hostOrTraining && S.phase === "rally") updateBot(p, dt);
    animatePlayer(p, dt, time);
  }
  if (S.ball && S.mode === "online" && !S.host && S.netBallTarget) {
    const blend = 1 - Math.exp(-22 * dt);
    S.ball.position.lerp(S.netBallTarget, blend);
  }
  if (S.ball && (S.host || S.mode === "training")) simulateBall(dt);
  if (S.mode === "online" && !S.host && S.networkReady) {
    const now = performance.now();
    if (now - S.lastPingAt > 2000) {
      sendToHost({ type: "ping", sentAt: now });
      S.lastPingAt = now;
    }
    if (S.lastHostMessageAt && now - S.lastHostMessageAt > 7000 && !S.connectionLost) {
      S.connectionLost = true;
      S.networkReady = false;
      $("#networkLabel").textContent = "MẤT TÍN HIỆU";
      $("#gameStatus").textContent = "Không nhận được dữ liệu từ chủ phòng. Hãy kiểm tra kết nối.";
      toast("Mất tín hiệu từ chủ phòng.");
    }
  }
  if (S.mode === "online" && S.host && performance.now() - S.lastSnapshot > 45) {
    broadcastSnapshot(); S.lastSnapshot = performance.now();
  }
}
Object.defineProperty(S, "hostOrTraining", { get() { return S.host || S.mode === "training"; } });

function updateBot(p, dt) {
  if (!S.ball || !S.velocity || S.phase !== "rally") return;
  const roles = assignDoublesRoles(S.players, p.team, {
    x: S.ball.position.x, y: S.ball.position.y, z: S.ball.position.z
  }, {
    x: S.velocity.x, y: S.velocity.y, z: S.velocity.z
  });
  const role = roles.find(item => item.id === p.id);
  if (!role) return;
  p.botRole = role.role;

  const toX = role.targetX - p.x;
  const toZ = role.targetZ - p.z;
  const distanceToTarget = Math.hypot(toX, toZ);
  const roleSpeed = role.role === "chaser" ? 4.45 : role.role === "advance" ? 3.65 : 3.15;
  const desiredSpeed = Math.min(roleSpeed, distanceToTarget * 3.1);
  const desiredX = distanceToTarget > .001 ? toX / distanceToTarget * desiredSpeed : 0;
  const desiredZ = distanceToTarget > .001 ? toZ / distanceToTarget * desiredSpeed : 0;
  p.velocityX = THREE.MathUtils.damp(p.velocityX || 0, desiredX, 8.2, dt);
  p.velocityZ = THREE.MathUtils.damp(p.velocityZ || 0, desiredZ, 8.2, dt);
  p.x = THREE.MathUtils.clamp(p.x + p.velocityX * dt, -2.55, 2.55);
  p.z = THREE.MathUtils.clamp(p.z + p.velocityZ * dt,
    p.team === 0 ? 1.1 : -7.15,
    p.team === 0 ? 7.15 : -1.1);
  p.moving = Math.min(1, Math.hypot(p.velocityX, p.velocityZ) / 4.5);
  p.rotation = Math.atan2(-(S.ball.position.x - p.x), -(S.ball.position.z - p.z));
  if (p.mesh) {
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.rotation;
  }

  p.botThink = Math.max(0, (p.botThink || 0) - dt);
  p.lungeCooldown = Math.max(0, (p.lungeCooldown || 0) - dt);
  const dist = Math.hypot(S.ball.position.x - p.x, S.ball.position.z - p.z);
  if (role.role === "chaser" && dist < 1.4 && p.lungeCooldown <= 0 && p.moving > .25) {
    p.lunge = .48;
    p.lungeSide = S.ball.position.x >= p.x ? 1 : -1;
    p.lungeStrength = THREE.MathUtils.clamp((dist - .35) / 1.1, .28, .85);
    p.lungeCooldown = .9;
  }

  const canContest = role.role === "chaser" && shouldBotContestBall({
    player: p,
    ball: { x: S.ball.position.x, z: S.ball.position.z },
    velocity: { x: S.velocity.x, z: S.velocity.z },
    expectedBounceTeam: S.expectedBounceTeam,
    cooldown: S.cooldown
  });
  if (canContest && dist < 1.45 && p.botThink <= 0) {
    p.botThink = .85;
    const opponents = S.players.filter(player => player.team !== p.team)
      .map(player => ({ x: player.x, z: player.z }));
    const plan = chooseBotShot({
      ball: { x: S.ball.position.x, y: S.ball.position.y, z: S.ball.position.z },
      player: p,
      opponents
    });
    performHit(plan.shot, p.id, true, plan.targetX);
  }
}
function simulateBall(dt) {
  if (S.phase !== "rally" || !S.ball || !S.velocity) return;
  const previous = S.ball.position.clone();

  // A perforated pickleball loses speed quickly in flight. Spin adds a small Magnus curve.
  const speed = S.velocity.length();
  const drag = .0014 * speed;
  S.velocity.addScaledVector(S.velocity, -drag * dt);
  if (S.spin && S.spin.lengthSq() > .01) {
    S.magnus.crossVectors(S.spin, S.velocity).multiplyScalar(.0015);
    S.velocity.addScaledVector(S.magnus, dt);
    S.spin.multiplyScalar(Math.exp(-1.05 * dt));
  }
  S.velocity.y -= 9.81 * dt;
  S.ball.position.addScaledVector(S.velocity, dt);
  S.ball.rotation.x += (S.spin?.x || 0) * dt;
  S.ball.rotation.y += (S.spin?.y || 0) * dt;
  S.ball.rotation.z += (S.spin?.z || 0) * dt;

  // Test the exact crossing point against the top of the net and its tape.
  const crossedNet = (previous.z < 0 && S.ball.position.z >= 0)
    || (previous.z > 0 && S.ball.position.z <= 0);
  if (crossedNet) {
    const fraction = THREE.MathUtils.clamp(
      -previous.z / (S.ball.position.z - previous.z || 1), 0, 1
    );
    const crossingX = THREE.MathUtils.lerp(previous.x, S.ball.position.x, fraction);
    const crossingY = THREE.MathUtils.lerp(previous.y, S.ball.position.y, fraction);
    const receivingTeam = S.ball.position.z >= 0 ? 0 : 1;
    for (const player of S.players) {
      if (player.team === receivingTeam) player.splitStep = Math.max(player.splitStep || 0, .34);
    }
    // Net tape is about 1.0 m high; include the ball's 10.5 cm radius.
    if (crossingY < 1.08 && Math.abs(crossingX) <= COURT.halfW + .12) {
      // A serve that clips the net is not an automatic let: play it if it
      // lands in the correct diagonal service court; otherwise the bounce is a fault.
      if (S.serveActive) S.serveNetContact = true;
      else {
        awardPoint(1 - S.lastHitTeam, "Bóng chạm lưới");
        return;
      }
    }
  }

  if (Math.abs(S.ball.position.x) > COURT.halfW + .18 || Math.abs(S.ball.position.z) > COURT.halfL + .18) {
    awardPoint(1 - S.lastHitTeam, "Bóng ra ngoài");
    return;
  }

  // Court contact: absorb horizontal energy, transfer a little spin, then rebound.
  if (S.ball.position.y <= .105 && S.velocity.y < 0) {
    S.ball.position.y = .105;
    const impactSpeed = Math.abs(S.velocity.y);
    S.velocity.y = impactSpeed > .9 ? impactSpeed * .57 : 0;
    S.velocity.x *= .84;
    S.velocity.z *= .84;
    if (S.spin) {
      S.velocity.x += S.spin.y * .004;
      S.velocity.z -= S.spin.x * .002;
      S.spin.multiplyScalar(.58);
    }
    if (S.velocity.y < .82) S.velocity.y = 0;

    const side = S.ball.position.z >= 0 ? 0 : 1;
    S.sideBounces[side] += 1;
    S.ballBouncedSinceHit = true;
    if (S.serveActive) {
      const inCorrectServiceArea = isValidServeLanding({
        x: S.ball.position.x,
        z: S.ball.position.z,
        servingTeam: S.servingTeam,
        targetX: S.serveTargetX,
        halfWidth: COURT.halfW,
        halfLength: COURT.halfL,
        kitchenDepth: COURT.kitchen
      });
      S.serveActive = false;
      if (!inCorrectServiceArea) {
        awardPoint(1 - S.servingTeam, "Giao bóng lỗi: phải vào đúng ô chéo, ngoài Kitchen");
        return;
      }
    }
    if (S.twoBounceStep < 2 && S.expectedBounceTeam === side) {
      S.twoBounceStep += 1;
      S.expectedBounceTeam = S.twoBounceStep === 1 ? 1 - side : null;
    }
    if (S.sideBounces[side] >= 2) {
      awardPoint(1 - side, "Bóng nảy hai lần");
      return;
    }
    $("#gameStatus").textContent = S.expectedBounceTeam === null
      ? "DOUBLE BOUNCE RULE ĐÃ HOÀN TẤT · Có thể volley"
      : "Bóng đã nảy · Tiếp tục pha bóng";
  }

  // A ball that has settled on the court rolls to a stop instead of hovering forever.
  if (S.ball.position.y <= .106 && Math.abs(S.velocity.y) < .02) {
    const rollingFriction = Math.exp(-1.65 * dt);
    S.velocity.x *= rollingFriction;
    S.velocity.z *= rollingFriction;
    S.velocity.y = 0;
    if (Math.hypot(S.velocity.x, S.velocity.z) < .28) {
      S.velocity.set(0, 0, 0);
      awardPoint(1 - S.lastHitTeam, "Bóng không được trả lại");
    }
  }
}
function startServe(requestedBy = S.id) {
  if (S.mode === "online" && !S.host) {
    const teamPlayers = S.players.filter(p => p.team === S.servingTeam);
    const activeServer = teamPlayers[S.serverIndex % Math.max(1, teamPlayers.length)];
    if (activeServer?.id !== S.id) {
      toast("Chưa đến lượt giao bóng của bạn.");
      return;
    }
    sendToHost({ type: "serve" }); return;
  }
  if (S.phase !== "ready") { toast("Pha bóng hiện tại chưa kết thúc."); return; }
  const teamPlayers = S.players.filter(p => p.team === S.servingTeam);
  if (!teamPlayers.length) { toast("Đang chờ người giao bóng của đội."); return; }
  const server = teamPlayers[S.serverIndex % teamPlayers.length];
  if (S.mode === "online" && server.id !== requestedBy) {
    toast("Chưa đến lượt giao bóng của bạn.");
    return;
  }
  const direction = server.team === 0 ? -1 : 1;
  const serviceSide = Math.sign(server.x) || (server.team === 0 ? 1 : -1);
  server.x = serviceSide * 1.9;
  server.z = server.team === 0 ? 6.82 : -6.82;
  server.targetX = server.x; server.targetZ = server.z;
  if (server.mesh) server.mesh.position.set(server.x, 0, server.z);
  const partner = teamPlayers.find(player => player.id !== server.id);
  if (partner) {
    partner.x = -server.x;
    partner.targetX = partner.x;
    if (partner.mesh) partner.mesh.position.x = partner.x;
  }
  const targetX = -server.x * .55;
  // Place the ball just inside the baseline, in front of the server.
  S.ball.position.set(server.x, 1.25, server.z + direction * .22);
  S.velocity.set((targetX - server.x) * .65, 5.4, direction * 8.0);
  S.spin?.set(direction * 2.4, server.x > 0 ? -1.2 : 1.2, 0);
  S.phase = "rally"; S.rally = 0; S.twoBounceStep = 0; S.sideBounces = [0, 0];
  S.ballBouncedSinceHit = false; S.serveNetContact = false;
  S.expectedBounceTeam = 1 - server.team; S.serveActive = true; S.serveTargetX = targetX;
  S.lastHitTeam = server.team; S.cooldown = .25;
  $("#gameStatus").textContent = "SERVE · Giao dưới tay chéo sân; bóng phải nảy trước khi trả";
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
function paddleContactDistance(player) {
  const paddle = player.mesh?.userData?.paddle;
  if (paddle && player.mesh) {
    player.mesh.updateWorldMatrix(true, true);
    const contact = new THREE.Vector3();
    paddle.getWorldPosition(contact);
    return S.ball.position.distanceTo(contact);
  }
  const angle = player.rotation || 0;
  const forwardX = -Math.sin(angle), forwardZ = -Math.cos(angle);
  const rightX = Math.cos(angle), rightZ = -Math.sin(angle);
  const contactX = player.x + forwardX * .52 + rightX * .24;
  const contactZ = player.z + forwardZ * .52 + rightZ * .24;
  return Math.hypot(S.ball.position.x - contactX, S.ball.position.y - 1.02, S.ball.position.z - contactZ);
}
function performHit(shot, playerId, fromBot, aimX = null) {
  if (S.phase !== "rally" || S.cooldown > 0) return;
  const p = S.players.find(x => x.id === playerId);
  if (!p || !S.ball) return;
  const ballSide = S.ball.position.z >= 0 ? 0 : 1;
  if (ballSide !== p.team) {
    if (!fromBot) toast("Bóng đang ở phần sân đối phương.");
    return;
  }
  const bodyDistance = Math.hypot(S.ball.position.x - p.x, S.ball.position.z - p.z);
  const contactDistance = paddleContactDistance(p);
  const contactLimit = 1.34 + THREE.MathUtils.clamp((S.ball.position.y - .8) * .08, 0, .18);
  if (bodyDistance > 2.05 || contactDistance > contactLimit || S.ball.position.y > 3.1) {
    if (!fromBot) toast("Đưa vợt đến gần bóng hơn để chạm bóng.");
    return;
  }
  if (S.expectedBounceTeam === p.team) {
    awardPoint(1 - p.team, "Vi phạm luật bóng phải nảy");
    return;
  }
  const isActualVolley = !S.ballBouncedSinceHit;
  if (isActualVolley && isInKitchen(p)) {
    awardPoint(1 - p.team, "Volley khi đang chạm Kitchen");
    return;
  }
  const spec = SHOTS[shot] || SHOTS.drive;
  const direction = p.team === 0 ? -1 : 1;
  const targetX = Number.isFinite(aimX)
    ? THREE.MathUtils.clamp(aimX, -2.5, 2.5)
    : THREE.MathUtils.clamp(-p.x * .55 + (Math.random() - .5) * 1.8, -2.5, 2.5);
  const lateral = (targetX - S.ball.position.x) * .45 + (shot === "slice" ? .45 : 0);
  S.velocity.set(lateral, spec.lift, direction * spec.speed);
  S.spin?.set(
    direction * spec.topspin,
    (spec.sidespin || 0) * Math.sign(targetX - p.x || 1),
    0
  );
  S.ball.position.y = Math.max(S.ball.position.y, .32);
  if (isActualVolley) p.volleyFollowThrough = .9;
  S.ballBouncedSinceHit = false;
  S.lastHitTeam = p.team;
  S.sideBounces = [0, 0];
  S.cooldown = .22;
  p.swing = 1; p.swingType = shot;
  const relativeBallSide = (S.ball.position.x - p.x) * (p.team === 0 ? 1 : -1);
  p.swingSide = relativeBallSide < -.12 ? "backhand" : "forehand";
  p.lunge = bodyDistance > .95 ? .56 : .3;
  p.lungeSide = S.ball.position.x >= p.x ? 1 : -1;
  p.lungeStrength = THREE.MathUtils.clamp((bodyDistance - .55) / 1.45, .32, 1);
  p.lungeCooldown = .72;
  p.rotation = Math.atan2(-(targetX - p.x), -direction);
  if (p.mesh) p.mesh.rotation.y = p.rotation;
  S.rally++;
  $("#gameStatus").textContent = spec.label;
  syncScore();
}
function switchTeamSides(team) {
  const players = S.players.filter(player => player.team === team);
  if (players.length < 2) return;
  const firstX = players[0].x;
  players[0].x = players[1].x;
  players[1].x = firstX;
  for (const player of players) {
    player.targetX = player.x;
    if (player.mesh) player.mesh.position.x = player.x;
  }
}
function awardPoint(winner, reason) {
  if (S.phase !== "rally") return;
  S.phase = "point";
  S.velocity.set(0, 0, 0);
  S.spin?.set(0, 0, 0);
  const transition = nextServeState({
    score: S.score,
    servingTeam: S.servingTeam,
    serverIndex: S.serverIndex,
    serverNumber: S.serverNumber,
    players: S.players,
    winner
  });
  S.score = transition.score;
  S.servingTeam = transition.servingTeam;
  S.serverIndex = transition.serverIndex;
  S.serverNumber = transition.serverNumber;
  if (transition.switchSides) switchTeamSides(S.servingTeam);

  const won = isMatchWon(S.score, winner);
  $("#gameStatus").textContent = (winner === 0 ? "TEAM YOLO" : "OPPONENT") + " THẮNG PHA BÓNG · " + reason;
  syncScore();
  if (won) {
    S.phase = "finished";
    S.matchWinner = winner;
    $("#gameStatus").textContent = "MATCH FINAL · " + (winner === 0 ? "TEAM YOLO" : "OPPONENT")
      + " CHIẾN THẮNG · " + S.score[0] + "–" + S.score[1];
    syncScore();
    toast("Trận đấu kết thúc. Đội thắng: " + (winner === 0 ? "YOLO" : "Đối thủ"));
    return;
  }
  if (S.mode === "online" && !S.host) return;
  clearTimeout(S.pointTimer);
  S.pointTimer = setTimeout(() => {
    if (S.phase !== "point") return;
    S.phase = "ready";
    const teamPlayers = S.players.filter(p => p.team === S.servingTeam);
    const next = teamPlayers[S.serverIndex % Math.max(1, teamPlayers.length)];
    if (next) S.ball.position.set(next.x, .12, next.z - (next.team === 0 ? .2 : -.2));
    syncScore();
    $("#gameStatus").textContent = "ĐIỂM ĐÃ KẾT THÚC · " + S.score[0] + "–" + S.score[1]
      + " · Nhấn SERVE để giao bóng tiếp";
  }, 1700);
}
function selectShot(shot) {
  S.shot = shot;
  $$(".shot-button").forEach(b => b.classList.toggle("selected", b.dataset.shot === shot));
  $("#gameStatus").textContent = shot.toUpperCase() + " SELECTED · Nhấn lại nút kỹ thuật để đánh bóng";
}
$$("[data-shot]").forEach(btn => btn.addEventListener("click", () => {
  const shot = btn.dataset.shot;
  selectShot(shot);
  if (S.phase === "rally") attemptShot(shot);
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
  const max = Math.min((r.width - 44) / 2, 40);
  const len = Math.hypot(x, y);
  if (len > max) { x = x / len * max; y = y / len * max; }
  const rawX = x / max, rawY = y / max;
  const magnitude = Math.hypot(rawX, rawY);
  const deadzone = .12;
  const scale = magnitude > deadzone ? (magnitude - deadzone) / (1 - deadzone) / magnitude : 0;
  knob.style.transform = "translate(" + x + "px," + y + "px)";
  S.joy.x = rawX * scale; S.joy.z = rawY * scale;
}
joystick.addEventListener("pointerdown", e => { joyPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); moveJoystick(e); });
joystick.addEventListener("pointermove", e => { if (joyPointer === e.pointerId) moveJoystick(e); });
function resetJoystick(e) {
  if (joyPointer !== e.pointerId) return;
  joyPointer = null; knob.style.transform = ""; S.joy.x = 0; S.joy.z = 0;
}
joystick.addEventListener("pointerup", resetJoystick);
joystick.addEventListener("pointercancel", resetJoystick);
joystick.addEventListener("lostpointercapture", resetJoystick);

function sendToHost(message) {
  for (const conn of S.conns.values()) {
    if (!conn.open) continue;
    try { conn.send(message); }
    catch (error) { console.warn("Network send failed", error); }
  }
}
function serializePlayers() {
  return S.players.map(p => ({
    id: p.id, name: p.name, color: p.color,
    x: Number.isFinite(p.x) ? p.x : 0,
    z: Number.isFinite(p.z) ? p.z : 0,
    rotation: Number.isFinite(p.rotation) ? p.rotation : 0,
    team: p.team, slot: p.slot,
    swing: p.swing || 0, swingType: p.swingType || "drive",
    swingSide: p.swingSide || "forehand",
    splitStep: p.splitStep || 0, lunge: p.lunge || 0,
    lungeSide: p.lungeSide || 1, lungeStrength: p.lungeStrength || 1,
    volleyFollowThrough: p.volleyFollowThrough || 0,
    connected: p.connected !== false
  }));
}
function sendWelcome(conn) {
  const player = S.players.find(p => p.id === conn.peer);
  conn.send({
    type: "welcome", players: serializePlayers(), score: [...S.score],
    servingTeam: S.servingTeam, serverIndex: S.serverIndex,
    serverNumber: S.serverNumber, matchWinner: S.matchWinner,
    hostId: S.id, resumeToken: player?.resumeToken || null
  });
}
function broadcastSnapshot() {
  if (!S.host) return;
  const snapshot = {
    type: "snapshot",
    seq: ++S.snapshotSeq,
    serverTime: Date.now(),
    players: serializePlayers(),
    score: [...S.score], servingTeam: S.servingTeam, serverIndex: S.serverIndex, serverNumber: S.serverNumber,
    matchWinner: S.matchWinner, rally: S.rally, phase: S.phase, expectedBounceTeam: S.expectedBounceTeam,
    twoBounceStep: S.twoBounceStep, serveActive: S.serveActive, sideBounces: S.sideBounces,
    ball: S.ball ? { x: S.ball.position.x, y: S.ball.position.y, z: S.ball.position.z,
      vx: S.velocity.x, vy: S.velocity.y, vz: S.velocity.z,
      sx: S.spin?.x || 0, sy: S.spin?.y || 0, sz: S.spin?.z || 0 } : null,
    status: $("#gameStatus").textContent
  };
  for (const conn of S.conns.values()) {
    if (!conn.open) continue;
    const buffered = conn.dataChannel?.bufferedAmount || 0;
    if (buffered > 128 * 1024) continue;
    try { conn.send(snapshot); }
    catch (error) { console.warn("Snapshot send failed", error); }
  }
}
function attachConnection(conn, isGuest) {
  const session = S.networkSession;
  let joined = false;
  let handshakeTimer = null;
  conn.on("open", () => {
    if (session !== S.networkSession) return;
    S.conns.set(conn.peer, conn);
    if (isGuest) {
      S.networkReady = false;
      S.connectionLost = false;
      S.lastHostMessageAt = performance.now();
      handshakeTimer = setTimeout(() => {
        if (session !== S.networkSession || S.networkReady || !conn.open) return;
        $("#gameStatus").textContent = "Không nhận được phản hồi từ chủ phòng.";
        toast("Kết nối phòng quá thời gian.");
        conn.close();
      }, 15000);
      conn.send({ type: "join", name: S.name, color: S.color, resumeToken: S.resumeToken });
    } else {
      handshakeTimer = setTimeout(() => {
        if (session === S.networkSession && !joined && conn.open) conn.close();
      }, 12000);
    }
  });
  conn.on("data", message => {
    if (session !== S.networkSession || !message || !message.type) return;
    if (isGuest) S.lastHostMessageAt = performance.now();
    if (message.type === "join" && S.host) {
      const token = typeof message.resumeToken === "string" && /^[a-f0-9]{32}$/i.test(message.resumeToken)
        ? message.resumeToken : "";
      const duplicate = token
        ? S.players.find(p => p.resumeToken === token && p.connected !== false)
        : null;
      if (duplicate) {
        conn.send({ type: "full", reason: "Tài khoản này đã có kết nối trong phòng." });
        conn.close();
        return;
      }
      S.players = expireDisconnectedPlayers(S.players, Date.now());
      let player = findResumablePlayer(S.players, token, Date.now());
      if (player) {
        player.id = conn.peer;
        player.connected = true;
        player.disconnectUntil = 0;
        player.lastInputSeq = 0;
      } else {
        const slot = findAvailableSlot(S.players, Date.now(), 4);
        if (slot < 0) {
          conn.send({ type: "full", reason: "Phòng đang đủ người hoặc còn chỗ được giữ để kết nối lại." });
          conn.close();
          return;
        }
        player = createPlayer(slot, conn.peer, "PLAYER", slot < 2 ? "#70c5e8" : "#ed9b9b");
        player.resumeToken = token || makeResumeToken();
        S.players.push(player);
      }
      joined = true;
      clearTimeout(handshakeTimer);
      player.name = cleanName(message.name);
      player.color = typeof message.color === "string" && /^#[0-9a-f]{6}$/i.test(message.color)
        ? message.color : player.color || "#70c5e8";
      player.connected = true;
      player.disconnectUntil = 0;
      sendWelcome(conn);
      updateMeshes(); syncScore(); broadcastSnapshot();
    } else if (message.type === "input" && S.host) {
      const player = S.players.find(p => p.id === conn.peer);
      if (player && Number.isFinite(message.x) && Number.isFinite(message.z)) {
        const seq = Number.isSafeInteger(message.seq) ? message.seq : (player.lastInputSeq || 0) + 1;
        if (seq > (player.lastInputSeq || 0)) {
          player.lastInputSeq = seq;
          player.targetX = THREE.MathUtils.clamp(message.x, -2.55, 2.55);
          player.targetZ = player.team === 0
            ? THREE.MathUtils.clamp(message.z, 1.1, 7.15)
            : THREE.MathUtils.clamp(message.z, -7.15, -1.1);
          player.targetRotation = Number.isFinite(message.rotation)
            ? THREE.MathUtils.clamp(message.rotation, -Math.PI, Math.PI)
            : (player.targetRotation || 0);
        }
      }
    } else if (message.type === "shot" && S.host) {
      if (Object.prototype.hasOwnProperty.call(SHOTS, message.shot)) performHit(message.shot, conn.peer, false);
    } else if (message.type === "serve" && S.host) {
      const teamPlayers = S.players.filter(p => p.team === S.servingTeam);
      const server = teamPlayers[S.serverIndex % Math.max(1, teamPlayers.length)];
      if (S.phase === "ready" && server?.id === conn.peer) startServe(conn.peer);
      else conn.send({ type: "serveDenied", reason: "Chưa đến lượt giao bóng của bạn." });
    } else if (message.type === "serveDenied" && !S.host) {
      toast(message.reason || "Chưa đến lượt giao bóng.");
    } else if (message.type === "ping" && S.host) {
      if (Number.isFinite(message.sentAt)) conn.send({ type: "pong", sentAt: message.sentAt });
    } else if (message.type === "pong" && !S.host) {
      if (Number.isFinite(message.sentAt)) {
        S.rtt = Math.max(0, performance.now() - message.sentAt);
        $("#networkLabel").textContent = "PHÒNG ONLINE · " + Math.round(S.rtt) + "ms";
      }
    } else if (message.type === "welcome" && !S.host) {
      clearTimeout(handshakeTimer);
      S.networkReady = true;
      S.connectionLost = false;
      S.lastHostMessageAt = performance.now();
      S.lastPingAt = 0;
      S.reconnectAttempts = 0;
      clearTimeout(S.reconnectTimer); S.reconnectTimer = null;
      S.hostPeerId = message.hostId || "yolo-pb-" + S.code;
      S.resumeToken = typeof message.resumeToken === "string" ? message.resumeToken : S.resumeToken;
      saveRoomResume();
      $("#reconnectButton").hidden = true;
      mergePlayers(message.players || S.players, true);
      S.score = message.score || [0, 0];
      S.servingTeam = message.servingTeam ?? 0;
      S.serverIndex = message.serverIndex ?? 0;
      S.serverNumber = message.serverNumber ?? 1;
      S.matchWinner = message.matchWinner ?? null;
      $("#networkLabel").textContent = "PHÒNG ONLINE · ĐÃ KẾT NỐI";
      $("#gameStatus").textContent = "ĐÃ KẾT NỐI · ĐANG ĐỒNG BỘ TRẬN ĐẤU";
      syncScore(); updateMeshes();
    } else if (message.type === "snapshot" && !S.host) {
      if (Number.isSafeInteger(message.seq) && message.seq <= S.lastSnapshotSeq) return;
      if (Number.isSafeInteger(message.seq)) S.lastSnapshotSeq = message.seq;
      S.networkReady = true;
      S.connectionLost = false;
      S.lastHostMessageAt = performance.now();
      S.reconnectAttempts = 0;
      clearTimeout(S.reconnectTimer); S.reconnectTimer = null;
      $("#reconnectButton").hidden = true;
      mergePlayers(message.players || S.players);
      S.score = message.score || S.score;
      S.servingTeam = message.servingTeam ?? S.servingTeam;
      S.serverIndex = message.serverIndex ?? S.serverIndex;
      S.serverNumber = message.serverNumber ?? S.serverNumber;
      S.matchWinner = message.matchWinner ?? S.matchWinner;
      S.rally = message.rally ?? S.rally;
      S.phase = message.phase || S.phase;
      S.expectedBounceTeam = message.expectedBounceTeam;
      S.twoBounceStep = message.twoBounceStep ?? S.twoBounceStep;
      S.serveActive = message.serveActive ?? S.serveActive;
      S.sideBounces = message.sideBounces || [0, 0];
      if (message.ball && S.ball) {
        S.netBallTarget = new THREE.Vector3(message.ball.x, message.ball.y, message.ball.z);
        S.velocity.set(message.ball.vx || 0, message.ball.vy || 0, message.ball.vz || 0);
        S.spin?.set(message.ball.sx || 0, message.ball.sy || 0, message.ball.sz || 0);
      }
      $("#gameStatus").textContent = message.status || "";
      syncScore(); updateMeshes();
    } else if (message.type === "full") {
      S.networkReady = false;
      S.connectionLost = true;
      $("#reconnectButton").hidden = true;
      $("#gameStatus").textContent = message.reason || "PHÒNG ĐÃ ĐỦ 4 NGƯỜI";
      toast(message.reason || "Phòng đã đủ 4 người."); conn.close();
    }
  });
  conn.on("close", () => {
    if (session !== S.networkSession) return;
    clearTimeout(handshakeTimer);
    const isCurrentConnection = S.conns.get(conn.peer) === conn;
    if (isCurrentConnection) S.conns.delete(conn.peer);
    if (!isCurrentConnection) return;
    if (S.host) {
      const player = S.players.find(p => p.id === conn.peer);
      if (player && player.slot !== 0 && joined) {
        player.connected = false;
        player.disconnectUntil = Date.now() + RECONNECT_GRACE_MS;
        player.velocityX = 0; player.velocityZ = 0; player.moving = 0;
        const token = player.resumeToken;
        const disconnectedId = player.id;
        setTimeout(() => {
          if (session !== S.networkSession) return;
          const current = S.players.find(p => p.resumeToken === token && p.id === disconnectedId);
          if (current && current.connected === false && current.disconnectUntil <= Date.now()) {
            S.players = S.players.filter(item => item !== current);
            updateMeshes(); broadcastSnapshot();
          }
        }, RECONNECT_GRACE_MS + 100);
      }
      updateMeshes(); broadcastSnapshot();
    } else {
      S.networkReady = false;
      if (!S.connectionLost) {
        S.connectionLost = true;
        $("#networkLabel").textContent = "MẤT KẾT NỐI";
        $("#gameStatus").textContent = "Mất kết nối với chủ phòng. YOLO đang thử kết nối lại...";
        toast("Mất kết nối. Đang thử kết nối lại.");
        scheduleReconnect();
      }
    }
  });
  conn.on("error", error => {
    console.warn("Peer connection error", error);
    if (session === S.networkSession && !S.host) {
      S.networkReady = false;
      S.connectionLost = true;
      $("#networkLabel").textContent = "LỖI KẾT NỐI";
      $("#gameStatus").textContent = "Kết nối không ổn định. YOLO sẽ tự thử kết nối lại.";
      scheduleReconnect();
    }
  });
}
function leaveNetwork() {
  clearTimeout(S.pointTimer);
  S.networkSession++;
  clearTimeout(S.reconnectTimer); S.reconnectTimer = null;
  S.reconnectAttempts = 0;
  for (const conn of S.conns.values()) try { conn.close(); } catch {}
  S.conns.clear();
  if (S.peer) { try { S.peer.destroy(); } catch {} S.peer = null; }
  S.host = false; S.networkReady = false; S.connectionLost = false;
  S.netBallTarget = null; S.lastHostMessageAt = 0; S.lastSnapshotSeq = 0;
}
function startTraining() {
  leaveNetwork();
  S.mode = "training"; S.code = "TRAINING"; S.id = "local";
  S.players = [
    { ...createPlayer(0, "local", S.name, S.color), local: true },
    { ...createPlayer(1, "bot1", "RIVAL 01", "#ed9b9b"), bot: true },
    { ...createPlayer(2, "bot2", "YOLO BOT", "#70c5e8"), bot: true },
    { ...createPlayer(3, "bot3", "RIVAL 02", "#ed9b9b"), bot: true }
  ];
  S.score = [0, 0]; S.servingTeam = 0; S.serverIndex = 1; S.serverNumber = 2; S.rally = 0;
  S.phase = "ready"; S.expectedBounceTeam = null; S.twoBounceStep = 0; S.serveActive = false; S.sideBounces = [0, 0];
  S.ballBouncedSinceHit = false; S.serveNetContact = false; S.matchWinner = null;
  $("#networkLabel").textContent = "CHẾ ĐỘ LUYỆN TẬP";
  syncScore(); $("#roomCodeLabel").textContent = "TRAINING";
  $("#networkLabel").textContent = "CHẾ ĐỘ LUYỆN TẬP";
  $("#gameStatus").textContent = "SẴN SÀNG · Nhấn SERVE để bắt đầu";
  updateMeshes(); showScreen(true);
}
function createRoom() {
  leaveNetwork();
  S.mode = "online"; S.host = true; S.networkReady = false; S.connectionLost = false;
  clearRoomResume(); S.resumeToken = null; S.hostPeerId = null;
  S.snapshotSeq = 0; S.code = String(Math.floor(1000 + Math.random() * 9000));
  S.id = "host";
  S.players = [createPlayer(0, S.id, S.name, S.color)];
  S.score = [0, 0]; S.servingTeam = 0; S.serverIndex = 1; S.serverNumber = 2; S.rally = 0;
  S.phase = "ready"; S.expectedBounceTeam = null; S.twoBounceStep = 0; S.serveActive = false; S.sideBounces = [0, 0];
  S.ballBouncedSinceHit = false; S.serveNetContact = false; S.matchWinner = null;
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
    $("#networkLabel").textContent = "PHÒNG ONLINE · CHỦ PHÒNG";
    $("#gameStatus").textContent = "PHÒNG ĐÃ MỞ · Chia sẻ mã YOLO-" + S.code;
    toast("Đã tạo phòng YOLO-" + S.code);
  });
  S.peer.on("connection", conn => {
    const connected = S.players.filter(player => player.connected !== false).length;
    if (connected >= 4) {
      conn.on("open", () => conn.send({ type: "full", reason: "Phòng đã đủ 4 người." }));
      setTimeout(() => conn.close(), 500); return;
    }
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
  S.mode = "online"; S.host = false; S.networkReady = false; S.connectionLost = false;
  S.inputSeq = 0; S.lastSnapshotSeq = 0; S.lastPingAt = 0; S.rtt = 0;
  S.code = code; S.id = "joining"; S.netBallTarget = null;
  const savedRoom = loadRoomResume(code);
  S.resumeToken = savedRoom?.token || makeResumeToken();
  S.hostPeerId = savedRoom?.hostPeerId || "yolo-pb-" + code;
  S.reconnectAttempts = 0;
  saveRoomResume();
  S.players = [createPlayer(0, S.id, S.name, S.color)];
  S.score = [0, 0]; S.servingTeam = 0; S.serverIndex = 1; S.serverNumber = 2; S.phase = "ready"; S.twoBounceStep = 0; S.serveActive = false;
  S.ballBouncedSinceHit = false; S.serveNetContact = false; S.matchWinner = null;
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
    console.warn(error);
    S.networkReady = false;
    S.connectionLost = true;
    $("#gameStatus").textContent = "Không tìm thấy phòng hoặc máy chủ đang bận. YOLO sẽ thử kết nối lại.";
    scheduleReconnect();
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
$("#reconnectButton").onclick = reconnectRoom;
$("#copyRoomButton").onclick = async () => {
  try { await navigator.clipboard.writeText("YOLO-" + S.code); toast("Đã sao chép mã YOLO-" + S.code); }
  catch { toast("Mã phòng: YOLO-" + S.code); }
};
$$(".color-dot").forEach(btn => btn.onclick = () => {
  $$(".color-dot").forEach(x => x.classList.remove("selected"));
  btn.classList.add("selected"); S.color = btn.dataset.color;
  saveProfile();
  document.documentElement.style.setProperty("--shirt", S.color);
  const local = S.players.find(p => p.id === S.id); if (local) local.color = S.color;
  updatePlayerLabels();
});
document.addEventListener("visibilitychange", () => { if (document.hidden) S.keys.clear(); });
loadSavedProfile();
document.documentElement.style.setProperty("--shirt", S.color);
$(".color-dot").forEach(btn => btn.classList.toggle("selected", btn.dataset.color === S.color));
setName(S.name);
syncPlayerUI();
