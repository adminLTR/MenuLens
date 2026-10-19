import * as THREE from 'three';
import { coverRect } from './menuScan.js';

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ray = new THREE.Ray();
const _ndc = new THREE.Vector3();
const _projected = new THREE.Vector3();

export function createHitMesh() {
  const positions = new Float32Array(12);
  const meshGeo = new THREE.BufferGeometry();
  meshGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  meshGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const mesh = new THREE.Mesh(
    meshGeo,
    new THREE.MeshBasicMaterial({
      color: 0xc2410c,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  const line = new THREE.LineLoop(
    lineGeo,
    new THREE.LineBasicMaterial({ color: 0xfed7aa, linewidth: 2 }),
  );

  const group = new THREE.Group();
  group.add(mesh);
  group.add(line);
  group.visible = false;
  group.frustumCulled = false;
  mesh.frustumCulled = false;
  line.frustumCulled = false;
  return group;
}

export function updateHitMesh(group, corners) {
  const mesh = group.children[0];
  const line = group.children[1];
  const write = (geometry) => {
    const data = geometry.attributes.position.array;
    for (let i = 0; i < 4; i += 1) {
      data[i * 3] = corners[i].x;
      data[i * 3 + 1] = corners[i].y;
      data[i * 3 + 2] = corners[i].z;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingSphere();
  };
  write(mesh.geometry);
  write(line.geometry);
  group.visible = true;
}

export function hideHitMesh(group) {
  if (group) group.visible = false;
}

export function getMonoCamera(renderer, fallback) {
  if (!renderer?.xr?.isPresenting) return fallback;
  const xrCam = renderer.xr.getCamera();
  return xrCam?.cameras?.[0] || xrCam || fallback;
}

export function planeFromHitPose(pose, target = new THREE.Plane()) {
  _matrix.fromArray(pose.transform.matrix);
  _matrix.decompose(_position, _quaternion, _scale);
  _normal.set(0, 1, 0).applyQuaternion(_quaternion).normalize();
  return target.setFromNormalAndCoplanarPoint(_normal, _position);
}

export function coverNormToNdc(nx, ny, overlay, imageW, imageH) {
  const { offsetX, offsetY, drawW, drawH } = coverRect(
    overlay.clientWidth,
    overlay.clientHeight,
    imageW,
    imageH,
  );
  const px = offsetX + nx * drawW;
  const py = offsetY + ny * drawH;
  return {
    x: (px / overlay.clientWidth) * 2 - 1,
    y: -((py / overlay.clientHeight) * 2 - 1),
  };
}

export function clientToNdc(clientX, clientY, overlay) {
  const rect = overlay.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  };
}

export function freezeCamera(camera) {
  const copy = new THREE.PerspectiveCamera();
  copy.projectionMatrix.copy(camera.projectionMatrix);
  copy.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  copy.matrixWorld.copy(camera.matrixWorld);
  copy.matrixWorldInverse.copy(camera.matrixWorldInverse);
  copy.matrixWorldAutoUpdate = false;
  return copy;
}

export function intersectNdcPlane(camera, ndc, plane, lift = 0.002) {
  if (!camera || !plane) return null;
  if (camera.matrixWorldAutoUpdate !== false) camera.updateMatrixWorld();
  _origin.setFromMatrixPosition(camera.matrixWorld);
  _ndc.set(ndc.x, ndc.y, 0.5).unproject(camera);
  _dir.copy(_ndc).sub(_origin).normalize();
  _ray.set(_origin, _dir);
  const hit = _ray.intersectPlane(plane, new THREE.Vector3());
  if (!hit) return null;
  plane.coplanarPoint(_position);
  _normal.copy(plane.normal).normalize();
  if (_normal.dot(_dir) > 0) _normal.negate();
  hit.addScaledVector(_normal, lift);
  return hit;
}

export function projectWorldToOverlay(world, camera, overlay) {
  _projected.copy(world).project(camera);
  return {
    x: (_projected.x * 0.5 + 0.5) * overlay.clientWidth,
    y: (-_projected.y * 0.5 + 0.5) * overlay.clientHeight,
    visible: _projected.z >= -1 && _projected.z <= 1,
  };
}

export function aabbFromPoints(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
  };
}
