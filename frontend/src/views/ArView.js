import { Component } from '../core/component.js';
import {
  createRenderer,
  createScene,
  startCameraFallback,
  stopStream,
} from '../services/xr.js';
import {
  prepareVideoFrame,
  snapshotToBlob,
  cropImageRegion,
  mapContainBox,
  unprojectContainPoint,
  scanMenuImage,
  captureMenuPage,
} from '../services/menuScan.js';
import { warpMenu } from '../services/menuDetect.js';
import { createMenuDetector } from '../services/menuDetectClient.js';
import { createMenuEnhancer } from '../services/menuEnhanceClient.js';
import { createTextDetector } from '../services/textDetectClient.js';

const MIN_BOX = { w: 0.06, h: 0.016 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function clampBox(box) {
  const w = Math.max(MIN_BOX.w, Math.min(0.98, box.w));
  const h = Math.max(MIN_BOX.h, Math.min(0.35, box.h));
  const x = Math.max(0, Math.min(1 - w, box.x));
  const y = Math.max(0, Math.min(1 - h, box.y));
  return { x, y, w, h };
}

function rectFromPoints(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return clampBox({
    x,
    y,
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  });
}

function pointInBox(point, box, pad = 0) {
  return (
    point.x >= box.x - pad &&
    point.x <= box.x + box.w + pad &&
    point.y >= box.y - pad &&
    point.y <= box.y + box.h + pad
  );
}

function padDetectedBox(box) {
  return clampBox({
    x: box.x - box.w * 0.03,
    y: box.y - box.h * 0.18,
    w: box.w * 1.06,
    h: box.h * 1.36,
  });
}

function fallbackBox(point) {
  return clampBox({
    x: point.x - 0.22,
    y: point.y - 0.02,
    w: 0.44,
    h: 0.04,
  });
}

function chip(text) {
  const node = document.createElement('span');
  node.className = 'menu-card__chip';
  node.textContent = text;
  return node;
}

function section(title, content) {
  const wrap = document.createElement('div');
  const label = document.createElement('p');
  label.className = 'menu-card__facts-kicker';
  label.textContent = title;
  wrap.append(label, content);
  return wrap;
}

function resizeBox(box, handle, dx, dy) {
  let { x, y, w, h } = box;
  if (handle.includes('w')) {
    x += dx;
    w -= dx;
  }
  if (handle.includes('e')) w += dx;
  if (handle.includes('n')) {
    y += dy;
    h -= dy;
  }
  if (handle.includes('s')) h += dy;
  if (w < 0) {
    x += w;
    w = Math.abs(w);
  }
  if (h < 0) {
    y += h;
    h = Math.abs(h);
  }
  return clampBox({ x, y, w, h });
}

export class ArView extends Component {
  constructor() {
    super();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.stream = null;
    this.detector = null;
    this.enhancer = null;
    this.textDetector = null;
    this.picking = false;
    this.reading = false;
    this.captureMode = 'new';
    this.pages = [];
    this.pageIndex = 0;
    this.cardOpen = false;
    this.dishBox = null;
    this.drag = null;
    this.pointers = new Map();
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.pinch = null;
    this.pinchActive = false;
    this.ocrDismissed = false;
    this.ocrSeq = 0;
  }

  render() {
    return `
      <section class="ar">
        <video class="ar__video" data-video playsinline muted autoplay hidden></video>
        <canvas class="ar__snapshot" data-snapshot hidden></canvas>
        <canvas class="ar__canvas" data-canvas></canvas>
        <div class="ar__overlay" data-overlay hidden></div>
        <div class="ar__hud" data-hud>
          <p class="ar__status" data-status></p>
          <div class="ar__actions">
            <button class="btn btn-primary btn-lg" type="button" data-start-cam>Abrir câmara</button>
          </div>
        </div>
        <button class="menu-card-toggle" type="button" data-card-toggle hidden aria-label="Abrir carta">▲</button>
        <aside class="menu-card" data-card hidden>
          <div class="menu-card__stage" data-card-stage>
            <div class="menu-card__zoom" data-card-zoom>
              <img class="menu-card__image" data-card-image alt="Página do cardápio">
              <div class="dish-box" data-dish-box hidden>
                <button class="dish-box__btn dish-box__btn--cancel" type="button" data-dish-cancel aria-label="Cancelar">×</button>
                <button class="dish-box__btn dish-box__btn--ok" type="button" data-dish-ok aria-label="Leer plato">✓</button>
                <span class="dish-box__handle dish-box__handle--nw" data-handle="nw"></span>
                <span class="dish-box__handle dish-box__handle--ne" data-handle="ne"></span>
                <span class="dish-box__handle dish-box__handle--sw" data-handle="sw"></span>
                <span class="dish-box__handle dish-box__handle--se" data-handle="se"></span>
              </div>
            </div>
          </div>
          <button class="menu-card__fab menu-card__fab--close" type="button" data-card-close aria-label="Fechar">×</button>
          <button class="menu-card__fab menu-card__fab--add" type="button" data-add-page aria-label="Adicionar página">+</button>
          <button class="menu-card__fab menu-card__fab--remove" type="button" data-remove-page aria-label="Remover página">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M9 3h6l1 2h5v2H3V5h5l1-2zm-3 6h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9zm3 2v9h2v-9H9zm4 0v9h2v-9h-2z"/>
            </svg>
          </button>
          <button class="menu-card__nav menu-card__nav--prev" type="button" data-page-prev aria-label="Anterior">‹</button>
          <button class="menu-card__nav menu-card__nav--next" type="button" data-page-next aria-label="Seguinte">›</button>
          <span class="menu-card__index" data-page-index></span>
          <div class="menu-card__result" data-dish-result hidden>
            <button class="menu-card__result-close" type="button" data-dish-result-close aria-label="Cerrar">×</button>
            <div class="menu-card__loading" data-dish-loading hidden>
              <span class="menu-card__spinner" aria-hidden="true"></span>
              <p>Analizando el plato…</p>
            </div>
            <p class="menu-card__result-name" data-dish-name></p>
            <p class="menu-card__result-meta" data-dish-meta></p>
            <div class="menu-card__facts" data-dish-facts hidden></div>
          </div>
        </aside>
      </section>
    `;
  }

  bind() {
    const canvas = this.$('[data-canvas]');
    this.renderer = createRenderer(canvas);
    const { scene, camera } = createScene();
    this.scene = scene;
    this.camera = camera;
    this.detector = createMenuDetector();
    this.enhancer = createMenuEnhancer();
    this.textDetector = createTextDetector();

    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.clampPan();
      this.applyZoom();
      this.syncDishBox();
    };
    window.addEventListener('resize', this.onResize);

    this.renderer.setAnimationLoop(() => {
      this.renderer.render(this.scene, this.camera);
    });

    this.$('[data-start-cam]').addEventListener('click', () => this.openCamera());
    this.$('[data-overlay]').addEventListener('click', (event) => this.onOverlayClick(event));
    this.$('[data-card-toggle]').addEventListener('click', () => this.openCard());
    this.$('[data-card-close]').addEventListener('click', () => this.closeCard());
    this.$('[data-page-prev]').addEventListener('click', () => this.shiftPage(-1));
    this.$('[data-page-next]').addEventListener('click', () => this.shiftPage(1));
    this.$('[data-add-page]').addEventListener('click', () => this.beginCapture('add'));
    this.$('[data-remove-page]').addEventListener('click', () => this.removePage());
    this.$('[data-dish-cancel]').addEventListener('click', (event) => {
      event.stopPropagation();
      this.clearDishBox();
    });
    this.$('[data-dish-ok]').addEventListener('click', (event) => {
      event.stopPropagation();
      this.confirmDish();
    });
    this.$('[data-dish-result-close]').addEventListener('click', (event) => {
      event.stopPropagation();
      this.hideDishResult();
    });

    const stage = this.$('[data-card-stage]');
    stage.addEventListener('pointerdown', (event) => this.onStagePointerDown(event));
    stage.addEventListener('pointermove', (event) => this.onStagePointerMove(event));
    stage.addEventListener('pointerup', (event) => this.onStagePointerUp(event));
    stage.addEventListener('pointercancel', (event) => this.onStagePointerUp(event));
    stage.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.zoomAt(this.stagePoint(event), this.zoom * Math.exp(-event.deltaY * 0.002));
      },
      { passive: false },
    );
    stage.addEventListener('contextmenu', (event) => event.preventDefault());
    this.describeContext();
  }

  describeContext() {
    if (window.isSecureContext) {
      this.setStatus('Aponte para o cardápio e toque em Abrir câmara. Depois toque no centro da folha para criar a carta virtual.');
      return;
    }
    const secureUrl = `https://${window.location.host}${window.location.pathname}${window.location.hash}`;
    this.setStatus(
      `O Chrome no telemóvel só liga a câmara em HTTPS. Esta página está em HTTP, por isso recusa mesmo com a câmara já permitida no Google. Abra ${secureUrl} e aceite o certificado, ou em chrome://flags ative "Insecure origins treated as secure" para ${window.location.origin}.`,
    );
  }

  setStatus(text) {
    const el = this.$('[data-status]');
    if (el) el.textContent = text;
  }

  cameraErrorMessage(error) {
    const code = error?.code || error?.name;
    if (code === 'INSECURE_CONTEXT') {
      return `Sem HTTPS o Chrome bloqueia a câmara. Abra https://${window.location.host} e aceite o aviso de certificado.`;
    }
    if (code === 'MEDIA_UNSUPPORTED') {
      return 'Este navegador não expõe a câmara. No telemóvel use o Chrome.';
    }
    if (code === 'NotAllowedError' || code === 'PermissionDeniedError') {
      return 'Esta página ainda não tem permissão. No Chrome: ícone à esquerda do endereço → Permissões → Câmara → Permitir, e volte a tocar no botão.';
    }
    if (code === 'NotFoundError' || code === 'OverconstrainedError') {
      return 'Não foi encontrada uma câmara neste aparelho.';
    }
    if (code === 'NotReadableError') {
      return 'A câmara está ocupada por outra aplicação. Feche-a e tente de novo.';
    }
    return 'Não foi possível ligar a câmara. Confirme a permissão desta página no Chrome e tente de novo.';
  }

  async openCamera() {
    this.setStatus('A pedir acesso à câmara…');
    try {
      const video = this.$('[data-video]');
      this.stream = await startCameraFallback(video);
      video.hidden = false;
      this.showLiveHud();
    } catch (error) {
      this.setStatus(this.cameraErrorMessage(error));
    }
  }

  showLiveHud() {
    this.$('[data-hud]').classList.add('ar__hud--live');
    this.$('[data-start-cam]').hidden = true;
    this.$('[data-overlay]').hidden = false;
    this.$('[data-video]').hidden = false;
    this.setStatus(this.captureHint());
    this.syncCardChrome();
  }

  captureHint() {
    return 'Cuando el menú esté en la cámara, puede seleccionarlo dando click.';
  }

  onOverlayClick(event) {
    if (this.cardOpen) return;
    this.captureAtEvent(event);
  }

  async captureAtEvent() {
    if (this.picking) return;
    const video = this.$('[data-video]');
    const snapshot = this.$('[data-snapshot]');
    if (!video?.videoWidth) return;

    this.picking = true;
    this.setStatus('Escaneando el menú…');
    try {
      prepareVideoFrame(video, snapshot, { maxSide: 2000 });
      let pageBlob = await this.capturePageLocal(snapshot);
      if (!pageBlob) {
        try {
          const photo = await snapshotToBlob(snapshot, { quality: 0.92 });
          pageBlob = await this.enhanceBlob(await captureMenuPage(photo));
        } catch {
          pageBlob = null;
        }
      }
      if (!pageBlob) {
        this.setStatus('No encontré el menú. Encuadre la hoja completa y toque otra vez.');
        return;
      }
      const bitmap = await createImageBitmap(pageBlob);
      const url = URL.createObjectURL(pageBlob);
      const page = { url, width: bitmap.width, height: bitmap.height };
      if (bitmap.close) bitmap.close();
      this.commitPage(page);
      this.openCard();
    } catch {
      this.setStatus('Não foi possível capturar esta página. Tente outra vez.');
    } finally {
      this.picking = false;
    }
  }

  async capturePageLocal(snapshot) {
    const scale = Math.min(1, 900 / snapshot.width);
    const width = Math.max(1, Math.round(snapshot.width * scale));
    const height = Math.max(1, Math.round(snapshot.height * scale));
    const tmp = document.createElement('canvas');
    tmp.width = width;
    tmp.height = height;
    tmp.getContext('2d').drawImage(snapshot, 0, 0, width, height);
    const detectBitmap = await createImageBitmap(tmp);
    const corners = await this.detector.detect(detectBitmap);
    if (!corners) return null;
    const context = snapshot.getContext('2d', { willReadFrequently: true });
    const imageData = context.getImageData(0, 0, snapshot.width, snapshot.height);
    const warped = warpMenu(imageData, corners);
    if (!warped) return null;
    return this.enhanceCanvas(warped);
  }

  async enhanceBlob(blob) {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    return this.enhanceCanvas(canvas);
  }

  async enhanceCanvas(canvas) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const enhanced = await this.enhancer.enhance(pixels);
    if (enhanced) context.putImageData(enhanced, 0, 0);
    return snapshotToBlob(canvas, { quality: 0.96 });
  }

  commitPage(page) {
    if (this.captureMode === 'add' && this.pages.length) {
      this.pages.push(page);
      this.pageIndex = this.pages.length - 1;
    } else if (this.captureMode === 'replace' && this.pages[this.pageIndex]) {
      URL.revokeObjectURL(this.pages[this.pageIndex].url);
      this.pages[this.pageIndex] = page;
    } else {
      this.pages.forEach((item) => URL.revokeObjectURL(item.url));
      this.pages = [page];
      this.pageIndex = 0;
    }
    this.captureMode = 'add';
    this.resetZoom();
    this.clearDishBox();
    this.renderCardPage();
  }

  beginCapture(mode) {
    this.captureMode = mode;
    if (mode === 'new') {
      this.pages.forEach((item) => URL.revokeObjectURL(item.url));
      this.pages = [];
      this.pageIndex = 0;
    }
    this.closeCard();
    this.setStatus(this.captureHint());
  }

  removePage() {
    const page = this.pages[this.pageIndex];
    if (!page) return;
    URL.revokeObjectURL(page.url);
    this.pages.splice(this.pageIndex, 1);
    this.resetZoom();
    this.clearDishBox();
    if (!this.pages.length) {
      this.pageIndex = 0;
      this.closeCard();
      return;
    }
    this.pageIndex = Math.min(this.pageIndex, this.pages.length - 1);
    this.renderCardPage();
  }

  openCard() {
    if (!this.pages.length) return;
    this.cardOpen = true;
    this.$('[data-card]').hidden = false;
    this.$('[data-card-toggle]').hidden = true;
    this.renderCardPage();
  }

  closeCard() {
    this.cardOpen = false;
    this.resetZoom();
    this.clearDishBox();
    this.$('[data-card]').hidden = true;
    this.syncCardChrome();
    this.setStatus(this.captureHint());
  }

  syncCardChrome() {
    const toggle = this.$('[data-card-toggle]');
    if (!toggle) return;
    toggle.hidden = this.cardOpen || !this.pages.length;
    this.el?.classList.toggle('ar--has-card', Boolean(this.pages.length) && !this.cardOpen);
  }

  shiftPage(step) {
    if (!this.pages.length) return;
    this.pageIndex = (this.pageIndex + step + this.pages.length) % this.pages.length;
    this.resetZoom();
    this.clearDishBox();
    this.renderCardPage();
  }

  renderCardPage() {
    const page = this.pages[this.pageIndex];
    const image = this.$('[data-card-image]');
    const index = this.$('[data-page-index]');
    if (image) {
      image.hidden = !page;
      image.src = page?.url || '';
    }
    if (index) {
      index.hidden = this.pages.length < 2;
      index.textContent = `${this.pageIndex + 1} / ${this.pages.length}`;
    }
    this.$('[data-page-prev]').hidden = this.pages.length < 2;
    this.$('[data-page-next]').hidden = this.pages.length < 2;
    this.syncCardChrome();
    this.syncDishBox();
  }

  pageSize() {
    const page = this.pages[this.pageIndex];
    const image = this.$('[data-card-image]');
    return {
      width: image?.naturalWidth || page?.width || 1,
      height: image?.naturalHeight || page?.height || 1,
    };
  }

  stagePoint(event) {
    const stage = this.$('[data-card-stage]');
    const rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  imagePointFromEvent(event, { clamp = false } = {}) {
    const stage = this.$('[data-card-stage]');
    const { width, height } = this.pageSize();
    const local = this.stagePoint(event);
    const x = (local.x - this.panX) / this.zoom;
    const y = (local.y - this.panY) / this.zoom;
    const rect = stage.getBoundingClientRect();
    return unprojectContainPoint(rect.left + x, rect.top + y, stage, width, height, { clamp });
  }

  resetZoom() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.pinch = null;
    this.applyZoom();
  }

  applyZoom() {
    const layer = this.$('[data-card-zoom]');
    if (!layer) return;
    layer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  clampPan() {
    const stage = this.$('[data-card-stage]');
    if (!stage) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const minX = width - width * this.zoom;
    const minY = height - height * this.zoom;
    this.panX = Math.min(0, Math.max(minX, this.panX));
    this.panY = Math.min(0, Math.max(minY, this.panY));
    if (this.zoom <= MIN_ZOOM + 0.001) {
      this.zoom = MIN_ZOOM;
      this.panX = 0;
      this.panY = 0;
    }
  }

  zoomAt(center, nextZoom) {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const worldX = (center.x - this.panX) / this.zoom;
    const worldY = (center.y - this.panY) / this.zoom;
    this.zoom = zoom;
    this.panX = center.x - worldX * zoom;
    this.panY = center.y - worldY * zoom;
    this.clampPan();
    this.applyZoom();
  }

  pinchPoints() {
    const points = [...this.pointers.values()];
    if (points.length < 2) return null;
    return [points[0], points[1]];
  }

  beginPinch() {
    const pair = this.pinchPoints();
    if (!pair) return;
    const [a, b] = pair;
    this.pinchActive = true;
    this.pinch = {
      startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      startZoom: this.zoom,
      startPanX: this.panX,
      startPanY: this.panY,
      startCenter: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  updatePinch() {
    const pair = this.pinchPoints();
    if (!pair || !this.pinch) return;
    const [a, b] = pair;
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.pinch.startZoom * (dist / this.pinch.startDist)));
    const worldX = (this.pinch.startCenter.x - this.pinch.startPanX) / this.pinch.startZoom;
    const worldY = (this.pinch.startCenter.y - this.pinch.startPanY) / this.pinch.startZoom;
    this.zoom = zoom;
    this.panX = center.x - worldX * zoom;
    this.panY = center.y - worldY * zoom;
    this.clampPan();
    this.applyZoom();
  }

  cancelDrawForPinch() {
    const drawing = this.drag && (this.drag.mode === 'pending' || this.drag.mode === 'draw');
    this.drag = null;
    if (drawing) {
      this.dishBox = null;
      this.syncDishBox();
    }
  }

  onStagePointerDown(event) {
    if (!this.cardOpen || this.reading) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('[data-dish-cancel], [data-dish-ok]')) return;
    event.preventDefault();
    this.pointers.set(event.pointerId, this.stagePoint(event));
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture not available */
    }
    if (this.pointers.size >= 2) {
      this.hideDishResult();
      this.cancelDrawForPinch();
      this.beginPinch();
      return;
    }
    if (this.pinchActive) return;
    const handle = event.target.dataset?.handle;
    const point = this.imagePointFromEvent(event);
    if (!handle && !point) return;
    this.hideDishResult();
    if (handle && this.dishBox) {
      this.drag = {
        mode: 'resize',
        handle,
        origin: { ...this.dishBox },
        start: this.imagePointFromEvent(event, { clamp: true }),
      };
      return;
    }
    if (point && this.dishBox && pointInBox(point, this.dishBox, 0.012)) {
      this.drag = {
        mode: 'move',
        origin: { ...this.dishBox },
        start: point,
      };
      return;
    }
    this.drag = {
      mode: 'pending',
      startClient: { x: event.clientX, y: event.clientY },
      start: point,
      moved: false,
    };
  }

  onStagePointerMove(event) {
    if (this.pointers.has(event.pointerId)) {
      this.pointers.set(event.pointerId, this.stagePoint(event));
    }
    if (this.pinchActive) {
      if (this.pointers.size >= 2) this.updatePinch();
      return;
    }
    if (!this.drag) return;
    const point = this.imagePointFromEvent(event, { clamp: this.drag.mode !== 'pending' });
    if (this.drag.mode === 'pending') {
      const dist = Math.hypot(event.clientX - this.drag.startClient.x, event.clientY - this.drag.startClient.y);
      if (dist < 12 || !this.drag.start || !point) return;
      this.drag.mode = 'draw';
      this.dishBox = rectFromPoints(this.drag.start, point);
      this.syncDishBox();
      return;
    }
    if (!point || !this.drag.start) return;
    const dx = point.x - this.drag.start.x;
    const dy = point.y - this.drag.start.y;
    if (this.drag.mode === 'draw') {
      this.dishBox = rectFromPoints(this.drag.start, point);
    } else if (this.drag.mode === 'move') {
      this.dishBox = clampBox({
        x: this.drag.origin.x + dx,
        y: this.drag.origin.y + dy,
        w: this.drag.origin.w,
        h: this.drag.origin.h,
      });
    } else if (this.drag.mode === 'resize') {
      this.dishBox = resizeBox(this.drag.origin, this.drag.handle, dx, dy);
    }
    this.syncDishBox();
  }

  async onStagePointerUp(event) {
    this.pointers.delete(event.pointerId);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    if (this.pinchActive) {
      this.drag = null;
      if (this.pointers.size >= 2) this.beginPinch();
      if (this.pointers.size === 0) {
        this.pinchActive = false;
        this.pinch = null;
      }
      return;
    }
    if (!this.drag) return;
    const pending = this.drag;
    this.drag = null;
    if (pending.mode === 'pending' && pending.start) {
      await this.detectDishAt(pending.start);
      return;
    }
    this.syncDishBox();
  }

  async detectDishAt(point) {
    const image = this.$('[data-card-image]');
    if (!image?.naturalWidth) {
      this.dishBox = fallbackBox(point);
      this.syncDishBox();
      return;
    }
    try {
      const scale = Math.min(1, 900 / image.naturalWidth);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const tmp = document.createElement('canvas');
      tmp.width = width;
      tmp.height = height;
      tmp.getContext('2d').drawImage(image, 0, 0, width, height);
      const bitmap = await createImageBitmap(tmp);
      const boxes = await this.textDetector.detectAtPoint(bitmap, {
        x: point.x,
        y: point.y,
        search: 0.05,
      });
      this.dishBox = boxes[0] ? padDetectedBox(boxes[0]) : fallbackBox(point);
    } catch {
      this.dishBox = fallbackBox(point);
    }
    this.syncDishBox();
  }

  syncDishBox() {
    const el = this.$('[data-dish-box]');
    const stage = this.$('[data-card-stage]');
    if (!el || !stage) return;
    if (!this.dishBox) {
      el.hidden = true;
      return;
    }
    const { width, height } = this.pageSize();
    const mapped = mapContainBox(this.dishBox, stage, width, height);
    el.hidden = false;
    el.classList.toggle('is-reading', this.reading);
    el.style.left = `${mapped.left}px`;
    el.style.top = `${mapped.top}px`;
    el.style.width = `${mapped.width}px`;
    el.style.height = `${mapped.height}px`;
  }

  clearDishBox() {
    this.dishBox = null;
    this.reading = false;
    this.syncDishBox();
    this.hideDishResult();
  }

  hideDishResult() {
    this.ocrSeq += 1;
    this.reading = false;
    this.ocrDismissed = true;
    const result = this.$('[data-dish-result]');
    if (result) {
      result.hidden = true;
      result.classList.remove('is-loading');
    }
    const loading = this.$('[data-dish-loading]');
    if (loading) loading.hidden = true;
    this.renderNutrition(null);
  }

  showDishLoading() {
    this.ocrDismissed = false;
    const result = this.$('[data-dish-result]');
    const loading = this.$('[data-dish-loading]');
    const title = this.$('[data-dish-name]');
    const extra = this.$('[data-dish-meta]');
    if (!result) return;
    result.hidden = false;
    result.classList.add('is-loading');
    if (loading) loading.hidden = false;
    if (title) title.textContent = '';
    if (extra) extra.textContent = '';
    this.renderNutrition(null);
  }

  showDishResult(name, meta, nutrition) {
    if (this.ocrDismissed) return;
    const result = this.$('[data-dish-result]');
    const loading = this.$('[data-dish-loading]');
    const title = this.$('[data-dish-name]');
    const extra = this.$('[data-dish-meta]');
    if (!result || !title) return;
    result.hidden = false;
    result.classList.remove('is-loading');
    if (loading) loading.hidden = true;
    title.textContent = nutrition?.name || name;
    if (extra) extra.textContent = nutrition ? '' : meta || '';
    this.renderNutrition(nutrition);
  }

  renderNutrition(info) {
    const root = this.$('[data-dish-facts]');
    if (!root) return;
    root.replaceChildren();
    if (!info) {
      root.hidden = true;
      return;
    }
    root.hidden = false;

    const nutrients = [
      ['Calorías', info.calories, 'kcal'],
      ['Carbohidratos', info.carbohydrates, 'g'],
      ['Grasas', info.fats, 'g'],
      ['Proteínas', info.proteins, 'g'],
      ['Fibra', info.fiber, 'g'],
    ].filter((item) => item[1] != null);

    if (nutrients.length) {
      const grid = document.createElement('div');
      grid.className = 'menu-card__facts-grid';
      nutrients.forEach(([label, value, unit]) => {
        const fact = document.createElement('div');
        fact.className = 'menu-card__fact';
        const amount = document.createElement('strong');
        amount.className = 'menu-card__fact-value';
        amount.textContent = `${value} ${unit}`;
        const caption = document.createElement('span');
        caption.className = 'menu-card__fact-label';
        caption.textContent = label;
        fact.append(amount, caption);
        grid.append(fact);
      });
      root.append(grid);
    }

    const tags = document.createElement('div');
    tags.className = 'menu-card__chips';
    if (info.flavor) tags.append(chip(info.flavor));
    if (info.spice_level) tags.append(chip(`Picante: ${info.spice_level}`));
    if (tags.childNodes.length) root.append(section('Perfil', tags));

    if (info.associated_allergies?.length) {
      const chips = document.createElement('div');
      chips.className = 'menu-card__chips';
      info.associated_allergies.forEach((item) => chips.append(chip(item)));
      root.append(section('Alergias', chips));
    }

    if (info.basic_ingredients?.length) {
      const chips = document.createElement('div');
      chips.className = 'menu-card__chips';
      info.basic_ingredients.forEach((item) => chips.append(chip(item)));
      root.append(section('Ingredientes', chips));
    }
  }

  async confirmDish() {
    if (!this.dishBox || this.reading) return;
    const image = this.$('[data-card-image]');
    if (!image?.naturalWidth) return;
    const box = this.dishBox;
    const seq = (this.ocrSeq += 1);
    this.reading = true;
    this.dishBox = null;
    this.syncDishBox();
    this.showDishLoading();
    try {
      const crop = cropImageRegion(image, box);
      const blob = await snapshotToBlob(crop, { quality: 0.95 });
      const payload = await scanMenuImage(blob, { crop: true });
      if (seq !== this.ocrSeq) return;
      const nutrition = payload.nutrition || null;
      if (!nutrition?.name) {
        this.showDishResult(
          'No pude analizar el plato.',
          'Toque de nuevo el recuadro e intente otra vez.',
        );
        return;
      }
      this.showDishResult(nutrition.name, '', nutrition);
    } catch {
      if (seq !== this.ocrSeq) return;
      this.showDishResult(
        'No pude leer el recuadro.',
        'Toque de nuevo el plato e intente otra vez.',
      );
    } finally {
      if (seq === this.ocrSeq) this.reading = false;
    }
  }

  unmount() {
    this.pages.forEach((item) => URL.revokeObjectURL(item.url));
    this.detector?.dispose();
    this.enhancer?.dispose();
    this.textDetector?.dispose();
    window.removeEventListener('resize', this.onResize);
    this.renderer?.setAnimationLoop(null);
    stopStream(this.stream);
    this.renderer?.dispose();
    super.unmount();
  }
}
