import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

// One detailed, rigged Rocketbox athlete model is fetched once and cloned with independent
// skeletons for each player. The upstream asset is MIT-licensed; attribution is in THIRD_PARTY_NOTICES.md.
export const ATHLETE_MODEL_URL =
  "https://raw.githubusercontent.com/memoriesrohit/avatar-studio/main/models/andre_casual.glb";

let templatePromise = null;

const OUTFIT_PARTS = new Set([
  "Outfit_original", "Skin_original", "Outfit_formal", "Skin_formal",
  "Top_shirt", "Skin_shirt", "Top_tee", "Skin_tee", "Trousers", "Shoes"
]);
const SPORT_OUTFIT = new Set(["Top_tee", "Skin_tee", "Trousers", "Shoes"]);
const NOT_CLOTHES = /^(Body|Skin|Shoes|Trousers|Eyes|Eyebrows|Eyelashes|Teeth|Tongue|Hair)/;

function meshLabel(object) {
  return object.name && !/^mesh_\d|_\d+$/.test(object.name)
    ? object.name
    : object.parent?.name ?? object.name;
}

export function loadAthleteTemplate(onProgress) {
  if (!templatePromise) {
    const loader = new GLTFLoader();
    templatePromise = loader.loadAsync(ATHLETE_MODEL_URL, event => {
      if (event.total > 0) onProgress?.(event.loaded / event.total);
    }).catch(error => {
      templatePromise = null;
      throw error;
    });
  }
  return templatePromise;
}

function forEachMaterial(material, callback) {
  if (Array.isArray(material)) material.forEach(callback);
  else if (material) callback(material);
}

function addNamePlate(model) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(.47, .12),
    new THREE.MeshBasicMaterial({
      map: texture, transparent: true, side: THREE.DoubleSide,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
    })
  );
  // Rocketbox avatars face +Z. This decal sits on their back (-Z) and faces outward.
  plate.position.set(0, 1.37, -.19);
  plate.rotation.y = Math.PI;
  plate.renderOrder = 4;
  model.add(plate);
  return { canvas, ctx, texture, plate, lastName: "" };
}

function addPaddle(model) {
  const hand = model.getObjectByName("mixamorigRightHand");
  if (!hand) return null;

  const paddle = new THREE.Group();
  const edge = new THREE.MeshStandardMaterial({ color: 0x15231b, roughness: .45, metalness: .12 });
  const face = new THREE.MeshStandardMaterial({ color: 0x78a94a, roughness: .62, metalness: .03 });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0xd7d9c8, roughness: .82 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x20251f, roughness: .9 });

  const rim = new THREE.Mesh(new THREE.CapsuleGeometry(.095, .16, 5, 12), edge);
  rim.scale.set(1, 1.03, .34);
  rim.position.y = .13;
  paddle.add(rim);

  const paddleFace = new THREE.Mesh(new THREE.CapsuleGeometry(.082, .155, 5, 12), face);
  paddleFace.scale.set(1, 1.02, .25);
  paddleFace.position.set(0, .13, .012);
  paddle.add(paddleFace);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .19, 10), handleMat);
  handle.position.y = -.075;
  paddle.add(handle);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .075, 10), gripMat);
  grip.position.y = -.15;
  paddle.add(grip);

  paddle.position.set(0, -.035, .055);
  paddle.rotation.set(.12, 0, -.08);
  paddle.traverse(object => {
    if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
  });
  hand.add(paddle);
  return paddle;
}

function applyClothing(root, color) {
  const q = root.userData;
  const tint = new THREE.Color(color || "#c7f36b");
  for (const item of q.clothes) {
    const label = item.label;
    forEachMaterial(item.mesh.material, material => {
      if (!material.userData.yoloBaseColor) return;
      material.color.copy(material.userData.yoloBaseColor);
      if (label === "Top_tee") {
        material.color.multiply(tint).multiplyScalar(1.35);
      } else if (label === "Trousers") {
        material.color.multiply(new THREE.Color("#252e29"));
      }
    });
  }
  q.lastColor = color;
}

export function updateRiggedAvatar(root, player) {
  if (!root?.userData?.rigged) return;
  const q = root.userData;
  const name = (player.name || "YOLO").trim().slice(0, 14).toUpperCase();
  if (q.namePlate.lastName !== name) {
    const { ctx, texture } = q.namePlate;
    ctx.clearRect(0, 0, 512, 128);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 58px Arial";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(255,255,255,.88)";
    ctx.fillStyle = "#15231b";
    ctx.strokeText(name, 256, 66, 480);
    ctx.fillText(name, 256, 66, 480);
    texture.needsUpdate = true;
    q.namePlate.lastName = name;
  }
  if (q.lastColor !== player.color) applyClothing(root, player.color);
}

export function createRiggedAvatar(template, player) {
  const model = cloneSkeleton(template.scene);
  model.name = "YOLO_Rigged_Athlete";

  const clothes = [];
  model.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;

    // Every clone gets its own materials, while geometry and texture maps remain shared.
    if (Array.isArray(object.material)) object.material = object.material.map(material => material.clone());
    else if (object.material) object.material = object.material.clone();

    const label = meshLabel(object);
    if (OUTFIT_PARTS.has(label)) object.visible = SPORT_OUTFIT.has(label);

    forEachMaterial(object.material, material => {
      if (material.color) material.userData.yoloBaseColor = material.color.clone();
      if (label === "Top_tee" || label === "Trousers") {
        material.roughness = Math.max(material.roughness || .7, .72);
      }
    });
    if (!NOT_CLOTHES.test(label)) clothes.push({ mesh: object, label });
  });

  // Normalize the upstream model to a consistent court-player height, with feet on the court.
  const initialBounds = new THREE.Box3().setFromObject(model);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  const targetHeight = 1.78;
  const scale = initialSize.y > .01 ? targetHeight / initialSize.y : 1;
  model.scale.setScalar(scale);
  const scaledBounds = new THREE.Box3().setFromObject(model);
  model.position.y -= scaledBounds.min.y;

  // The source avatar faces +Z; the bottom-side team should face the net at -Z.
  model.rotation.y = Math.PI;

  const root = new THREE.Group();
  root.userData.playerId = player.id;
  root.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of template.animations || []) {
    actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
  }
  const idle = actions.idle || Object.values(actions)[0] || null;
  if (idle) idle.play();

  const bones = {
    hips: model.getObjectByName("mixamorigHips"),
    spine: model.getObjectByName("mixamorigSpine"),
    spine1: model.getObjectByName("mixamorigSpine1"),
    spine2: model.getObjectByName("mixamorigSpine2"),
    head: model.getObjectByName("mixamorigHead"),
    rightArm: model.getObjectByName("mixamorigRightArm"),
    rightForeArm: model.getObjectByName("mixamorigRightForeArm"),
    rightHand: model.getObjectByName("mixamorigRightHand"),
    leftArm: model.getObjectByName("mixamorigLeftArm"),
    leftForeArm: model.getObjectByName("mixamorigLeftForeArm"),
    leftUpLeg: model.getObjectByName("mixamorigLeftUpLeg"),
    rightUpLeg: model.getObjectByName("mixamorigRightUpLeg")
  };

  const morphMeshes = [];
  model.traverse(object => {
    if (object.isMesh && object.morphTargetDictionary && object.morphTargetInfluences) {
      const dictionary = object.morphTargetDictionary;
      const left = dictionary.eyeBlinkLeft;
      const right = dictionary.eyeBlinkRight;
      if (left !== undefined || right !== undefined) {
        morphMeshes.push({ mesh: object, left, right });
      }
    }
  });

  const namePlate = addNamePlate(model);
  const paddle = addPaddle(model);
  const q = root.userData;
  Object.assign(q, {
    rigged: true, model, mixer, actions, bones, clothes, namePlate, paddle,
    morphMeshes, activeMove: "idle", baseY: model.position.y,
    lastOverlay: new Map(), blinkNext: 2.5 + Math.random() * 2.5,
    blinkAt: -1, idlePhase: Math.random() * Math.PI * 2,
    lastColor: null
  });

  root.position.set(player.x, 0, player.z);
  root.rotation.y = player.rotation || 0;
  applyClothing(root, player.color);
  updateRiggedAvatar(root, player);
  return root;
}

function playLocomotion(q, moving) {
  const wanted = moving > .12 ? "walk" : "idle";
  if (wanted === q.activeMove) return;
  const next = q.actions[wanted] || q.actions.idle;
  const previous = q.actions[q.activeMove];
  if (next) {
    next.reset();
    next.setEffectiveTimeScale(wanted === "walk" ? 1.18 : 1);
    next.fadeIn(.2).play();
  }
  if (previous && previous !== next) previous.fadeOut(.2);
  q.activeMove = wanted;
}

function boneOverlay(q, bone, x, y, z) {
  if (!bone) return;
  const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  bone.quaternion.multiply(offset);
  q.lastOverlay.set(bone, offset);
}

function updateBlink(q, time) {
  if (!q.morphMeshes.length) return;
  if (time >= q.blinkNext && q.blinkAt < 0) q.blinkAt = time;
  let amount = 0;
  if (q.blinkAt >= 0) {
    const progress = (time - q.blinkAt) / .14;
    if (progress >= 1) {
      q.blinkAt = -1;
      q.blinkNext = time + 2.6 + Math.random() * 3.2;
    } else {
      amount = Math.sin(progress * Math.PI);
    }
  }
  for (const entry of q.morphMeshes) {
    if (entry.left !== undefined) entry.mesh.morphTargetInfluences[entry.left] = amount;
    if (entry.right !== undefined) entry.mesh.morphTargetInfluences[entry.right] = amount;
  }
}

export function animateRiggedAvatar(root, player, dt, time) {
  if (!root?.userData?.rigged) return;
  const q = root.userData;

  // Remove the previous procedural overlay before the animation mixer evaluates this frame.
  for (const [bone, offset] of q.lastOverlay) bone.quaternion.multiply(offset.clone().invert());
  q.lastOverlay.clear();

  const moving = player.moving || 0;
  playLocomotion(q, moving);
  q.mixer.update(dt);

  // A little athletic body lean and natural vertical motion while accelerating.
  q.model.position.y = q.baseY + (moving > .08
    ? Math.abs(Math.sin(time * 10.5 + q.idlePhase)) * .022 * moving
    : Math.sin(time * 1.8 + q.idlePhase) * .0025);
  if (moving > .08) boneOverlay(q, q.bones.spine1, .055 * moving, 0, 0);

  // Sport-specific paddle strokes layered over the mocap idle/walk pose.
  if (player.swing > 0) {
    player.swing = Math.max(0, player.swing - dt * 2.8);
    const progress = 1 - player.swing;
    const pulse = Math.sin(progress * Math.PI);
    const follow = progress > .5 ? (progress - .5) * 2 : progress * 2;
    const type = player.swingType || "drive";
    let shoulderX = -.78, shoulderZ = .38, elbowX = -.65, wristZ = -.16, torsoY = -.18;
    if (type === "dink") {
      shoulderX = -.48; shoulderZ = .18; elbowX = -.38; wristZ = -.1; torsoY = -.08;
    } else if (type === "slice") {
      shoulderX = -.58; shoulderZ = -.95; elbowX = -.45; wristZ = -.72; torsoY = -.42;
    } else if (type === "lob") {
      shoulderX = -1.45; shoulderZ = .2; elbowX = -.38; wristZ = .1; torsoY = .12;
    } else if (type === "volley") {
      shoulderX = -.88; shoulderZ = .28; elbowX = -.78; wristZ = -.12; torsoY = -.12;
    } else if (type === "smash") {
      shoulderX = -1.72; shoulderZ = .18; elbowX = -.42; wristZ = .16; torsoY = .1;
    }
    boneOverlay(q, q.bones.rightArm, shoulderX * pulse, 0, shoulderZ * pulse);
    boneOverlay(q, q.bones.rightForeArm, elbowX * pulse, 0, 0);
    boneOverlay(q, q.bones.rightHand, 0, 0, wristZ * pulse);
    boneOverlay(q, q.bones.spine1, 0, torsoY * pulse, .12 * pulse);
    if (q.paddle) q.paddle.rotation.z = -.18 + .34 * follow * pulse;
  } else if (q.paddle) {
    q.paddle.rotation.z *= Math.max(0, 1 - dt * 10);
  }

  // A small head response and real eyelid morphs keep the athlete from looking frozen.
  if (q.bones.head) {
    boneOverlay(q, q.bones.head,
      Math.sin(time * 1.15 + q.idlePhase) * .012,
      Math.sin(time * .72 + q.idlePhase) * .018, 0);
  }
  updateBlink(q, time);
}
