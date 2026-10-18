import * as THREE from 'three';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    30,
  );
  scene.add(new THREE.HemisphereLight(0xfff4e8, 0x3d2b1f, 1.1));
  return { scene, camera };
}

export async function isWebXRARAvailable() {
  if (!navigator.xr?.isSessionSupported) return false;
  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

export async function startWebXRAR(renderer, overlayRoot) {
  const supported = await isWebXRARAvailable();
  if (!supported) {
    const error = new Error('WEBXR_UNAVAILABLE');
    error.code = 'WEBXR_UNAVAILABLE';
    throw error;
  }

  const session = await navigator.xr.requestSession('immersive-ar', {
    optionalFeatures: ['dom-overlay', 'hit-test', 'light-estimation'],
    domOverlay: { root: overlayRoot },
  });

  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
  return session;
}

export async function startCameraFallback(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}
