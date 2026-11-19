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
const NOT_CLOTHES = /^(Body|Skin|Eyes|Eyebrows|Eyelashes|Teeth|Tongue|Hair)/;

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
    neck: model.getObjectByName("mixamorigNeck"),
    head: model.getObjectByName("mixamorigHead"),
    leftShoulder: model.getObjectByName("mixamorigLeftShoulder"),
    rightShoulder: model.getObjectByName("mixamorigRightShoulder"),
    leftArm: model.getObjectByName("mixamorigLeftArm"),
    rightArm: model.getObjectByName("mixamorigRightArm"),
    leftForeArm: model.getObjectByName("mixamorigLeftForeArm"),
    rightForeArm: model.getObjectByName("mixamorigRightForeArm"),
    leftHand: model.getObjectByName("mixamorigLeftHand"),
    rightHand: model.getObjectByName("mixamorigRightHand"),
    leftUpLeg: model.getObjectByName("mixamorigLeftUpLeg"),
    rightUpLeg: model.getObjectByName("mixamorigRightUpLeg"),
    leftLeg: model.getObjectByName("mixamorigLeftLeg"),
    rightLeg: model.getObjectByName("mixamorigRightLeg"),
    leftFoot: model.getObjectByName("mixamorigLeftFoot"),
    rightFoot: model.getObjectByName("mixamorigRightFoot"),
    leftToeBase: model.getObjectByName("mixamorigLeftToeBase"),
    rightToeBase: model.getObjectByName("mixamorigRightToeBase")
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

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smooth01(value, start, end) {
  const t = clamp01((value - start) / Math.max(.0001, end - start));
  return t * t * (3 - 2 * t);
}

function playLocomotion(q, moving) {
  const wanted = moving > .1 ? "walk" : "idle";
  if (wanted !== q.activeMove) {
    const next = q.actions[wanted] || q.actions.idle;
    const previous = q.actions[q.activeMove];
    if (next) {
      next.reset();
      next.setEffectiveTimeScale(wanted === "walk"
        ? THREE.MathUtils.clamp(.78 + moving * .95, .8, 1.85)
        : 1);
      next.fadeIn(.24).play();
    }
    if (previous && previous !== next) previous.fadeOut(.24);
    q.activeMove = wanted;
  }
  if (q.activeMove === "walk" && q.actions.walk) {
    q.actions.walk.setEffectiveTimeScale(THREE.MathUtils.clamp(.78 + moving * .95, .8, 1.85));
  }
}

function boneOverlay(q, bone, x, y, z) {
  if (!bone) return;
  const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  bone.quaternion.multiply(offset);
  const previous = q.lastOverlay.get(bone);
  if (previous) previous.multiply(offset);
  else q.lastOverlay.set(bone, offset.clone());
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

function lookAtBall(q, ballPosition, time) {
  if (!q.bones.head) return;
  if (!ballPosition) {
    boneOverlay(q, q.bones.head,
      Math.sin(time * 1.15 + q.idlePhase) * .012,
      Math.sin(time * .72 + q.idlePhase) * .018, 0);
    return;
  }

  q.model.updateWorldMatrix(true, false);
  const origin = q.model.getWorldPosition(new THREE.Vector3());
  const worldDirection = ballPosition.clone().sub(origin).normalize();
  const modelRotation = q.model.getWorldQuaternion(new THREE.Quaternion()).invert();
  const localDirection = worldDirection.applyQuaternion(modelRotation);
  const yaw = THREE.MathUtils.clamp(Math.atan2(localDirection.x, localDirection.z), -.48, .48);
  const pitch = THREE.MathUtils.clamp(
    -Math.atan2(localDirection.y, Math.hypot(localDirection.x, localDirection.z)), -.3, .28
  );
  boneOverlay(q, q.bones.head, pitch, yaw, 0);
}

export function animateRiggedAvatar(root, player, dt, time, ballPosition = null) {
  if (!root?.userData?.rigged) return;
  const q = root.userData;

  // Remove the previous frame's local-space pose layer before evaluating the mocap clip.
  for (const [bone, offset] of q.lastOverlay) bone.quaternion.multiply(offset.clone().invert());
  q.lastOverlay.clear();

  const moving = clamp01(player.moving || 0);
  const vx = player.velocityX || 0;
  const vz = player.velocityZ || 0;
  const speed = Math.hypot(vx, vz);
  playLocomotion(q, moving);
  q.mixer.update(dt);

  const ready = 1 - smooth01(moving, .04, .42);
  const forwardSpeed = -Math.sin(root.rotation.y) * vx - Math.cos(root.rotation.y) * vz;
  const lateralSpeed = Math.cos(root.rotation.y) * vx + Math.sin(root.rotation.y) * vz;

  // Pickleball ready position: low centre of gravity, flexed knees and paddle held in front.
  boneOverlay(q, q.bones.hips, .035 * ready, 0, -.035 * lateralSpeed * .035);
  boneOverlay(q, q.bones.spine1, .075 * ready - .035 * forwardSpeed, 0, -.055 * lateralSpeed);
  boneOverlay(q, q.bones.leftUpLeg, .14 * ready, 0, -.035 * ready);
  boneOverlay(q, q.bones.rightUpLeg, .14 * ready, 0, .035 * ready);
  boneOverlay(q, q.bones.leftLeg, -.24 * ready, 0, 0);
  boneOverlay(q, q.bones.rightLeg, -.24 * ready, 0, 0);
  boneOverlay(q, q.bones.leftFoot, .09 * ready, 0, 0);
  boneOverlay(q, q.bones.rightFoot, .09 * ready, 0, 0);
  boneOverlay(q, q.bones.leftArm, -.18 * ready, 0, -.12 * ready);
  boneOverlay(q, q.bones.leftForeArm, -.24 * ready, 0, -.05 * ready);
  boneOverlay(q, q.bones.rightArm, -.22 * ready, 0, .13 * ready);
  boneOverlay(q, q.bones.rightForeArm, -.3 * ready, 0, .02 * ready);

  // Natural acceleration, side-to-side weight transfer and running bounce.
  const lateralLean = THREE.MathUtils.clamp(lateralSpeed / 4.5, -1, 1);
  boneOverlay(q, q.bones.hips, 0, 0, -lateralLean * .075 * moving);
  boneOverlay(q, q.bones.spine1, -.045 * moving, 0, lateralLean * .095 * moving);
  if (moving > .08) {
    boneOverlay(q, q.bones.leftArm, .08 * Math.sin(time * 10 + q.idlePhase) * moving, 0, 0);
    boneOverlay(q, q.bones.leftForeArm, -.08 * Math.sin(time * 10 + q.idlePhase) * moving, 0, 0);
  }

  // Split step when the incoming ball crosses the net: a small hop, then land in a ready stance.
  let splitLift = 0;
  if ((player.splitStep || 0) > 0) {
    player.splitStep = Math.max(0, player.splitStep - dt);
    const progress = 1 - player.splitStep / .34;
    const pulse = Math.sin(clamp01(progress) * Math.PI);
    splitLift = .052 * pulse;
    boneOverlay(q, q.bones.hips, -.08 * pulse, 0, 0);
    boneOverlay(q, q.bones.leftUpLeg, -.08 * pulse, 0, -.055 * pulse);
    boneOverlay(q, q.bones.rightUpLeg, -.08 * pulse, 0, .055 * pulse);
    boneOverlay(q, q.bones.leftLeg, -.18 * pulse, 0, 0);
    boneOverlay(q, q.bones.rightLeg, -.18 * pulse, 0, 0);
    boneOverlay(q, q.bones.leftArm, -.12 * pulse, 0, -.08 * pulse);
    boneOverlay(q, q.bones.rightArm, -.12 * pulse, 0, .08 * pulse);
  }

  // Explosive reach and recovery when the player has to take a ball outside their stance.
  let lungeLift = 0;
  if ((player.lunge || 0) > 0) {
    player.lunge = Math.max(0, player.lunge - dt * 1.8);
    const progress = 1 - player.lunge;
    const intensity = Math.sin(clamp01(progress) * Math.PI) * (player.lungeStrength || 1);
    const side = player.lungeSide || 1;
    lungeLift = .018 * intensity;
    boneOverlay(q, q.bones.hips, -.18 * intensity, 0, -side * .2 * intensity);
    boneOverlay(q, q.bones.spine1, .18 * intensity, -.04 * side * intensity, side * .28 * intensity);
    boneOverlay(q, side > 0 ? q.bones.rightUpLeg : q.bones.leftUpLeg, -.58 * intensity, 0, side * .25 * intensity);
    boneOverlay(q, side > 0 ? q.bones.rightLeg : q.bones.leftLeg, .78 * intensity, 0, 0);
    boneOverlay(q, side > 0 ? q.bones.leftUpLeg : q.bones.rightUpLeg, .12 * intensity, 0, -side * .08 * intensity);
    boneOverlay(q, q.bones.rightArm, -.34 * intensity, 0, .16 * intensity);
    boneOverlay(q, q.bones.rightForeArm, -.24 * intensity, 0, 0);
  }

  q.model.position.y = q.baseY
    + (moving > .08 ? Math.abs(Math.sin(time * (8.5 + speed) + q.idlePhase)) * .018 * moving : Math.sin(time * 1.8 + q.idlePhase) * .0025)
    + splitLift + lungeLift;

  // Each stroke has a backswing, acceleration through contact and a controlled follow-through.
  if ((player.swing || 0) > 0) {
    player.swing = Math.max(0, player.swing - dt * 1.72);
    const progress = 1 - player.swing;
    const windup = Math.sin(clamp01(progress / .36) * Math.PI * .5);
    const strike = Math.sin(clamp01((progress - .25) / .48) * Math.PI);
    const follow = smooth01(progress, .48, .94);
    const type = player.swingType || "drive";
    let backX = -.52, hitX = .92, finishX = .18;
    let backZ = .2, hitZ = .38, finishZ = -.18;
    let elbowBack = -.16, elbowHit = -.82, elbowFinish = -.2;
    let wristHit = .16, torsoTurn = -.2, weightShift = .2;

    if (type === "dink") {
      backX = -.22; hitX = .48; finishX = .12;
      backZ = .08; hitZ = .12; finishZ = -.04;
      elbowBack = -.12; elbowHit = -.38; elbowFinish = -.1;
      wristHit = .12; torsoTurn = -.08; weightShift = .12;
    } else if (type === "slice") {
      backX = -.4; hitX = .55; finishX = .08;
      backZ = -.7; hitZ = -.85; finishZ = -.32;
      elbowBack = -.2; elbowHit = -.58; elbowFinish = -.14;
      wristHit = -.52; torsoTurn = -.38; weightShift = .18;
    } else if (type === "lob") {
      backX = -1.05; hitX = 1.15; finishX = .42;
      backZ = .12; hitZ = .22; finishZ = -.08;
      elbowBack = -.34; elbowHit = -.72; elbowFinish = -.18;
      wristHit = .22; torsoTurn = .14; weightShift = .1;
    } else if (type === "volley") {
      backX = -.28; hitX = .78; finishX = .08;
      backZ = .18; hitZ = .34; finishZ = -.14;
      elbowBack = -.12; elbowHit = -.72; elbowFinish = -.16;
      wristHit = .18; torsoTurn = -.12; weightShift = .08;
    } else if (type === "smash") {
      backX = -1.28; hitX = 1.32; finishX = .5;
      backZ = .1; hitZ = .18; finishZ = -.12;
      elbowBack = -.48; elbowHit = -.82; elbowFinish = -.2;
      wristHit = .28; torsoTurn = .18; weightShift = .24;
    }

    const armX = backX * (1 - windup) + hitX * strike + finishX * follow;
    const armZ = backZ * (1 - windup) + hitZ * strike + finishZ * follow;
    const elbowX = elbowBack * (1 - windup) + elbowHit * strike + elbowFinish * follow;
    boneOverlay(q, q.bones.rightArm, armX, 0, armZ);
    boneOverlay(q, q.bones.rightForeArm, elbowX, 0, wristHit * strike);
    boneOverlay(q, q.bones.rightHand, 0, 0, wristHit * .42 * strike);
    boneOverlay(q, q.bones.spine1, 0, torsoTurn * strike, .12 * strike);
    boneOverlay(q, q.bones.hips, 0, -torsoTurn * .45 * strike, -weightShift * strike);
    boneOverlay(q, q.bones.leftUpLeg, .12 * strike, 0, 0);
    boneOverlay(q, q.bones.rightUpLeg, -.12 * strike, 0, 0);
    if (q.paddle) {
      q.paddle.rotation.z = -.18 + .28 * strike - .1 * follow;
      q.paddle.rotation.x = .08 + .18 * strike;
    }
  } else if (q.paddle) {
    q.paddle.rotation.z = THREE.MathUtils.damp(q.paddle.rotation.z, -.18, 12, dt);
    q.paddle.rotation.x = THREE.MathUtils.damp(q.paddle.rotation.x, .08, 12, dt);
  }

  lookAtBall(q, ballPosition, time);
  updateBlink(q, time);
}
