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

function sessionHasFeature(session, feature) {
  const features = session.enabledFeatures;
  if (!features) return false;
  return typeof features.includes === 'function' ? features.includes(feature) : false;
}

export async function startWebXRAR(renderer, overlayRoot) {
  const supported = await isWebXRARAvailable();
  if (!supported) {
    const error = new Error('WEBXR_UNAVAILABLE');
    error.code = 'WEBXR_UNAVAILABLE';
    throw error;
  }

  const attempts = [
    {
      requiredFeatures: ['hit-test', 'dom-overlay', 'camera-access'],
      optionalFeatures: ['light-estimation', 'anchors'],
      domOverlay: { root: overlayRoot },
    },
    {
      requiredFeatures: ['hit-test', 'dom-overlay'],
      optionalFeatures: ['camera-access', 'light-estimation', 'anchors'],
      domOverlay: { root: overlayRoot },
    },
    {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'camera-access', 'light-estimation', 'anchors'],
      domOverlay: { root: overlayRoot },
    },
  ];

  let session = null;
  let lastError;
  for (const options of attempts) {
    try {
      session = await navigator.xr.requestSession('immersive-ar', options);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!session) {
    const error = lastError || new Error('WEBXR_UNAVAILABLE');
    error.code = error.code || 'WEBXR_UNAVAILABLE';
    throw error;
  }

  if (!session.requestHitTestSource) {
    await session.end().catch(() => {});
    const error = new Error('HIT_TEST_UNAVAILABLE');
    error.code = 'HIT_TEST_UNAVAILABLE';
    throw error;
  }

  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
  session.hasCameraAccess = sessionHasFeature(session, 'camera-access');
  return session;
}

export async function createViewerHitTestSource(session) {
  const viewerSpace = await session.requestReferenceSpace('viewer');
  return session.requestHitTestSource({ space: viewerSpace });
}

export function copyXrCameraToCanvas(renderer, frame, canvas, { maxSide = 960 } = {}) {
  const session = renderer.xr.getSession();
  const gl = renderer.getContext();
  const refSpace = renderer.xr.getReferenceSpace();
  if (!session || !frame || !gl || !refSpace) return null;
  if (typeof XRWebGLBinding === 'undefined') return null;

  const pose = frame.getViewerPose(refSpace);
  const view = pose?.views?.[0];
  const xrCamera = view?.camera;
  if (!xrCamera) return null;

  const prevFb = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const prevViewport = gl.getParameter(gl.VIEWPORT);
  const framebuffer = gl.createFramebuffer();

  try {
    const binding = new XRWebGLBinding(session, gl);
    if (typeof binding.getCameraImage !== 'function') return null;
    const texture = binding.getCameraImage(xrCamera);
    const width = xrCamera.width;
    const height = xrCamera.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;

    const pixels = new Uint8Array(width * height * 4);
    gl.viewport(0, 0, width, height);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const scale = Math.min(1, maxSide / Math.max(width, height));
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));
    const full = document.createElement('canvas');
    full.width = width;
    full.height = height;
    const fullCtx = full.getContext('2d', { willReadFrequently: true });
    const imageData = fullCtx.createImageData(width, height);
    const row = width * 4;
    for (let y = 0; y < height; y += 1) {
      const src = (height - 1 - y) * row;
      imageData.data.set(pixels.subarray(src, src + row), y * row);
    }
    fullCtx.putImageData(imageData, 0, 0);
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(full, 0, 0, outW, outH);
    return { width: outW, height: outH, sourceWidth: width, sourceHeight: height };
  } catch {
    return null;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb);
    if (prevViewport) gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
    gl.deleteFramebuffer(framebuffer);
  }
}

export function assertCameraContext() {
  if (!window.isSecureContext) {
    const error = new Error('INSECURE_CONTEXT');
    error.code = 'INSECURE_CONTEXT';
    throw error;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error('MEDIA_UNSUPPORTED');
    error.code = 'MEDIA_UNSUPPORTED';
    throw error;
  }
}

export async function startCameraFallback(videoEl) {
  assertCameraContext();

  const attempts = [
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: true, audio: false },
  ];

  let lastError;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('autoplay', '');
      videoEl.muted = true;
      videoEl.srcObject = stream;
      await videoEl.play();
      return stream;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}
