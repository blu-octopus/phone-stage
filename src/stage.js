// The 3D scene: a phone with your design on its screen, lit by a soft studio
// environment, plus a contact shadow. Renders into its own WebGL canvas; the
// app composites that over the background (see main.js / exporter.js).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Phone proportions (scene units), roughly a modern 6.1" phone.
const BODY = { w: 2.9, h: 6.0, d: 0.32, r: 0.46 };
const BEZEL = 0.11;
export const SCREEN = { w: BODY.w - 2 * BEZEL, h: BODY.h - 2 * BEZEL, r: BODY.r - BEZEL };
export const SCREEN_ASPECT = SCREEN.w / SCREEN.h;

export const FINISHES = {
  midnight: { label: 'Midnight', color: '#1e1e26', metalness: 0.6, roughness: 0.3 },
  silver: { label: 'Silver', color: '#d8d9de', metalness: 0.75, roughness: 0.22 },
  blush: { label: 'Blush', color: '#f0c3d2', metalness: 0.45, roughness: 0.32 },
  lavender: { label: 'Lavender', color: '#c4b4ee', metalness: 0.45, roughness: 0.32 },
  mint: { label: 'Mint', color: '#b9e6cf', metalness: 0.45, roughness: 0.32 },
};

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

// A flat rounded rectangle whose UVs span 0…1 across its width and height,
// so a texture maps onto it edge to edge.
function roundedPlane(w, h, r) {
  const g = new THREE.ShapeGeometry(roundedRect(w, h, r), 24);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return g;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function createStage() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); // callers size the canvas in real pixels
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 5, 6);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.1, 200);

  // ---- screen texture: a 2D canvas the app draws your design into ----------------
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 900;
  screenCanvas.height = Math.round(900 / SCREEN_ASPECT);
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // ---- the phone -------------------------------------------------------------------
  const phone = new THREE.Group();
  scene.add(phone);

  const bodyMat = new THREE.MeshPhysicalMaterial({ clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(BODY.w, BODY.h, BODY.d, 8, BODY.r), bodyMat);
  phone.add(body);

  const front = BODY.d / 2;
  const glass = new THREE.Mesh(
    roundedPlane(BODY.w - 0.03, BODY.h - 0.03, BODY.r - 0.015),
    new THREE.MeshPhysicalMaterial({ color: 0x050507, roughness: 0.08, metalness: 0, clearcoat: 1 }),
  );
  glass.position.z = front + 0.002;
  phone.add(glass);

  const screen = new THREE.Mesh(
    roundedPlane(SCREEN.w, SCREEN.h, SCREEN.r),
    new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false }),
  );
  screen.position.z = front + 0.004;
  phone.add(screen);

  // a barely-there glossy layer over the screen so it catches the studio light
  // without tinting the design (keep this subtle: designers need true colors)
  const gloss = new THREE.Mesh(
    roundedPlane(SCREEN.w, SCREEN.h, SCREEN.r),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.025, roughness: 0.1, metalness: 1, depthWrite: false }),
  );
  gloss.position.z = front + 0.006;
  phone.add(gloss);

  const island = new THREE.Mesh(roundedPlane(0.78, 0.22, 0.11), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  island.position.set(0, SCREEN.h / 2 - 0.26, front + 0.008);
  phone.add(island);

  // side buttons
  const buttonGeo = new RoundedBoxGeometry(0.05, 1, 0.12, 2, 0.02);
  for (const [x, y, len] of [[BODY.w / 2, 1.0, 0.85], [-BODY.w / 2, 1.5, 0.45], [-BODY.w / 2, 0.75, 0.75], [-BODY.w / 2, -0.15, 0.75]]) {
    const b = new THREE.Mesh(buttonGeo, bodyMat);
    b.scale.y = len;
    b.position.set(x + Math.sign(x) * 0.012, y, 0);
    phone.add(b);
  }

  // back: frosted glass panel + camera bump with three lenses and a flash
  const backMat = new THREE.MeshPhysicalMaterial({ roughness: 0.55, metalness: 0.2, clearcoat: 0.3 });
  const back = new THREE.Mesh(roundedPlane(BODY.w - 0.05, BODY.h - 0.05, BODY.r - 0.025), backMat);
  back.position.z = -front - 0.002;
  back.rotation.y = Math.PI;
  phone.add(back);

  const bump = new THREE.Mesh(new RoundedBoxGeometry(1.15, 1.15, 0.1, 4, 0.26), bodyMat);
  const bx = -BODY.w / 2 + 0.78;
  const by = BODY.h / 2 - 0.78;
  bump.position.set(bx, by, -front - 0.05);
  phone.add(bump);
  const ringMat = new THREE.MeshPhysicalMaterial({ color: 0x9a9aa2, metalness: 1, roughness: 0.25 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x050508, metalness: 0.2, roughness: 0.05, clearcoat: 1 });
  const ringGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.07, 40);
  const lensGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.08, 40);
  for (const [dx, dy] of [[-0.25, 0.25], [-0.25, -0.25], [0.25, 0]]) {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(bx + dx, by + dy, -front - 0.13);
    phone.add(ring);
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(bx + dx, by + dy, -front - 0.14);
    phone.add(lens);
  }
  const flash = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 24), new THREE.MeshStandardMaterial({ color: 0xfff3d6, roughness: 0.4 }));
  flash.rotation.x = Math.PI / 2;
  flash.position.set(bx + 0.27, by + 0.32, -front - 0.11);
  phone.add(flash);

  // contact shadow on an invisible floor
  const floorY = -BODY.h / 2 - 0.55;
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 1.6),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = floorY;
  scene.add(shadow);

  function setFinish(name) {
    const f = FINISHES[name] ?? FINISHES.midnight;
    bodyMat.color.set(f.color);
    bodyMat.metalness = f.metalness;
    bodyMat.roughness = f.roughness;
    backMat.color.set(f.color).multiplyScalar(0.92);
  }
  setFinish('midnight');

  // Frame the phone for an output aspect ratio. zoom > 1 = closer.
  let size = { w: 0, h: 0 };
  function frame(width, height, zoom = 1) {
    if (width !== size.w || height !== size.h) {
      renderer.setSize(width, height, false);
      size = { w: width, h: height };
    }
    const aspect = width / height;
    camera.aspect = aspect;
    const needH = (BODY.h * 1.42) / zoom;
    const needW = (BODY.w * 1.9) / zoom;
    const dist = Math.max(needH, needW / aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.set(0, dist * 0.06, dist);
    camera.lookAt(0, -0.35, 0);
    camera.updateProjectionMatrix();
  }

  // Draw one frame. pose = { rx, ry, rz, y } from motion.js.
  function render(pose, { island: showIsland = true, shadow: showShadow = true } = {}) {
    phone.rotation.set(pose.rx, pose.ry, pose.rz, 'XYZ');
    phone.position.y = pose.y;
    island.visible = showIsland;
    shadow.visible = showShadow;
    // the shadow tightens and darkens as the phone gets closer to the floor
    const lift = pose.y - floorY - BODY.h / 2;
    shadow.material.opacity = Math.max(0.25, 1 - lift * 0.9);
    shadow.scale.set(1 + Math.abs(Math.sin(pose.ry)) * 0.1, 1, 1);
    renderer.render(scene, camera);
    return renderer.domElement;
  }

  function updateScreen() {
    screenTexture.needsUpdate = true;
  }

  return { canvas: renderer.domElement, screenCanvas, frame, render, setFinish, updateScreen };
}
