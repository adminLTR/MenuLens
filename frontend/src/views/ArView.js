import { Component } from '../core/component.js';
import {
  createRenderer,
  createScene,
  startCameraFallback,
  stopStream,
} from '../services/xr.js';
import {
  cropVideoRegion,
  mapCoverPoint,
  prepareVideoFrame,
  scanMenuImage,
  snapshotToBlob,
  unprojectCoverPoint,
} from '../services/menuScan.js';
import { createTextDetector } from '../services/textDetectClient.js';
import { createRegionTracker } from '../services/regionTracker.js';

const DOUBLE_TAP_MS = 380;

export class ArView extends Component {
  constructor() {
    super();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.stream = null;
    this.selection = null;
    this.picking = false;
    this.tracking = false;
    this.trackBusy = false;
    this.trackToken = null;
    this.detector = null;
    this.tracker = createRegionTracker();
    this.lastBoxTap = 0;
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
          <article class="ar__selection" data-selection hidden></article>
          <div class="ar__actions">
            <button class="btn btn-primary btn-lg" type="button" data-start-cam>Abrir câmara</button>
          </div>
        </div>
      </section>
    `;
  }

  bind() {
    const canvas = this.$('[data-canvas]');
    this.renderer = createRenderer(canvas);
    const { scene, camera } = createScene();
    this.scene = scene;
    this.camera = camera;
    this.detector = createTextDetector();

    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.layoutHit();
    };
    window.addEventListener('resize', this.onResize);

    this.renderer.setAnimationLoop(() => {
      this.renderer.render(this.scene, this.camera);
    });

    this.$('[data-start-cam]').addEventListener('click', () => this.openCamera());
    this.$('[data-overlay]').addEventListener('click', (event) => this.onOverlayClick(event));
    this.describeContext();
  }

  describeContext() {
    if (window.isSecureContext) {
      this.setStatus('Aponte para o cardápio e toque em Abrir câmara. Depois toque num nome: o recuadro fica colado nesse texto.');
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
      return 'Esta página ainda não tem permissão. No Chrome: ícone à esquerda do endereço → Permissões → Câmara → Permitir, e volte a tocar no botão. A permissão do aplicativo Google não vale para este site.';
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
    this.$('[data-snapshot]').hidden = true;
    this.setStatus('Toque num nome do cardápio. O recuadro só aparece se houver texto. Para cancelar, toque noutro sítio ou no X.');
  }

  sourceSize() {
    const video = this.$('[data-video]');
    return { width: video.videoWidth, height: video.videoHeight, source: video };
  }

  onOverlayClick(event) {
    if (event.target.closest('[data-hit-close]')) {
      event.preventDefault();
      this.clearSelection();
      return;
    }
    if (event.target.closest('[data-hit]')) {
      this.onBoxTap(event);
      return;
    }
    if (this.selection) {
      event.preventDefault();
      this.clearSelection();
      return;
    }
    this.pickAtEvent(event);
  }

  onBoxTap(event) {
    event.preventDefault();
    const now = Date.now();
    if (now - this.lastBoxTap < DOUBLE_TAP_MS) {
      this.lastBoxTap = 0;
      this.readSelection();
      return;
    }
    this.lastBoxTap = now;
  }

  grabFrame(maxSide = 720) {
    const video = this.$('[data-video]');
    const snapshot = this.$('[data-snapshot]');
    snapshot.hidden = true;
    prepareVideoFrame(video, snapshot, { maxSide });
    const context = snapshot.getContext('2d', { willReadFrequently: true });
    return {
      canvas: snapshot,
      imageData: context.getImageData(0, 0, snapshot.width, snapshot.height),
    };
  }

  async frameToBitmap(canvas) {
    const scale = Math.min(1, 720 / canvas.width);
    const width = Math.max(1, Math.round(canvas.width * scale));
    const height = Math.max(1, Math.round(canvas.height * scale));
    const tmp = document.createElement('canvas');
    tmp.width = width;
    tmp.height = height;
    tmp.getContext('2d').drawImage(canvas, 0, 0, width, height);
    return createImageBitmap(tmp);
  }

  applyTrack(box) {
    if (!this.selection || !box || box.lost || !box.corners) return;
    this.selection.x = box.x;
    this.selection.y = box.y;
    this.selection.w = box.w;
    this.selection.h = box.h;
    this.selection.corners = box.corners;
    this.layoutHit();
  }

  async pickAtEvent(event) {
    if (this.picking) return;
    const overlay = this.$('[data-overlay]');
    const video = this.$('[data-video]');
    if (!video?.videoWidth) return;

    const point = unprojectCoverPoint(
      event.clientX,
      event.clientY,
      overlay,
      video.videoWidth,
      video.videoHeight,
    );
    if (!point) {
      this.setStatus('Toque em cima do cardápio, na zona da imagem.');
      return;
    }

    this.picking = true;
    this.setStatus('A procurar texto neste ponto…');
    try {
      const { canvas, imageData } = this.grabFrame(960);
      const bitmap = await this.frameToBitmap(canvas);
      const boxes = await this.detector.detectAtPoint(bitmap, point);
      const box = boxes[0];
      if (!box) {
        this.setStatus('Não encontrei texto neste ponto. Toque no nome de um prato.');
        return;
      }
      this.tracker.lock(imageData, box);
      this.selection = {
        ...box,
        corners: [
          { x: box.x, y: box.y },
          { x: box.x + box.w, y: box.y },
          { x: box.x + box.w, y: box.y + box.h },
          { x: box.x, y: box.y + box.h },
        ],
        reading: false,
        ocr: null,
      };
      this.lastBoxTap = 0;
      this.renderHit();
      const panel = this.$('[data-selection]');
      if (panel) panel.hidden = true;
      this.setStatus('Recuadro colado no texto. Toque duas vezes para ler. Toque noutro sítio ou no X para cancelar.');
      this.startTracking();
    } catch {
      this.setStatus('Não foi possível ler este ponto. Tente outra vez.');
    } finally {
      this.picking = false;
    }
  }

  startTracking() {
    if (this.tracking) return;
    this.tracking = true;
    const video = this.$('[data-video]');
    const tick = () => {
      if (!this.tracking || !this.selection) return;
      this.trackOnce();
      if (typeof video.requestVideoFrameCallback === 'function') {
        this.trackToken = { video: true, id: video.requestVideoFrameCallback(tick) };
      } else {
        this.trackToken = { video: false, id: requestAnimationFrame(tick) };
      }
    };
    if (typeof video.requestVideoFrameCallback === 'function') {
      this.trackToken = { video: true, id: video.requestVideoFrameCallback(tick) };
    } else {
      this.trackToken = { video: false, id: requestAnimationFrame(tick) };
    }
  }

  stopTracking() {
    this.tracking = false;
    const video = this.$('[data-video]');
    if (this.trackToken?.video && video && typeof video.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(this.trackToken.id);
    } else if (this.trackToken && !this.trackToken.video) {
      cancelAnimationFrame(this.trackToken.id);
    }
    this.trackToken = null;
  }

  trackOnce() {
    if (!this.selection || this.picking || this.trackBusy) return;
    const video = this.$('[data-video]');
    if (!video?.videoWidth) return;
    this.trackBusy = true;
    try {
      const { imageData } = this.grabFrame(400);
      const moved = this.tracker.update(imageData);
      if ((moved?.missed || 0) >= 18) {
        this.clearSelection('Aponte de novo para um nome. O recuadro sai quando aponta para outro lado.');
        return;
      }
      this.applyTrack(moved);
    } finally {
      this.trackBusy = false;
    }
  }

  renderHit() {
    const overlay = this.$('[data-overlay]');
    overlay.innerHTML = '';
    if (!this.selection) return;

    const hit = document.createElement('div');
    hit.className = 'ar__hit is-selected';
    hit.dataset.hit = '';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ar__hit-close';
    close.dataset.hitClose = '';
    close.setAttribute('aria-label', 'Cancelar seleção');
    close.textContent = '×';
    hit.appendChild(close);
    overlay.appendChild(hit);
    this.layoutHit();
  }

  layoutHit() {
    const overlay = this.$('[data-overlay]');
    const hit = overlay?.querySelector('[data-hit]');
    if (!hit || !this.selection) return;
    const { width, height } = this.sourceSize();
    if (!width) return;
    const corners = this.selection.corners || [
      { x: this.selection.x, y: this.selection.y },
      { x: this.selection.x + this.selection.w, y: this.selection.y },
      { x: this.selection.x + this.selection.w, y: this.selection.y + this.selection.h },
      { x: this.selection.x, y: this.selection.y + this.selection.h },
    ];
    const [tl, tr, , bl] = corners.map((corner) =>
      mapCoverPoint(corner.x, corner.y, overlay, width, height),
    );
    const edgeW = Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), 36);
    const edgeH = Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), 28);
    hit.style.left = '0px';
    hit.style.top = '0px';
    hit.style.width = `${edgeW}px`;
    hit.style.height = `${edgeH}px`;
    hit.style.transform = `matrix(${(tr.x - tl.x) / edgeW}, ${(tr.y - tl.y) / edgeW}, ${(bl.x - tl.x) / edgeH}, ${(bl.y - tl.y) / edgeH}, ${tl.x}, ${tl.y})`;
    hit.classList.toggle('is-reading', Boolean(this.selection.reading));
  }

  async clearSelection(message) {
    this.stopTracking();
    this.selection = null;
    this.lastBoxTap = 0;
    this.tracker.clear();
    const overlay = this.$('[data-overlay]');
    if (overlay) overlay.innerHTML = '';
    const panel = this.$('[data-selection]');
    if (panel) panel.hidden = true;
    this.setStatus(
      message || 'Toque num nome do cardápio. O recuadro só aparece se houver texto nesse ponto.',
    );
  }

  async readSelection() {
    if (!this.selection || this.selection.reading) return;
    if (this.selection.ocr) {
      this.showSelection(this.selection.ocr);
      return;
    }
    const { source } = this.sourceSize();
    this.selection.reading = true;
    this.layoutHit();
    this.showSelection({ text: 'A ler este recorte…', pending: true });
    try {
      const canvas = cropVideoRegion(source, this.selection);
      const blob = await snapshotToBlob(canvas);
      const result = await scanMenuImage(blob, { crop: true });
      const item = result.items?.[0] || { text: 'Não consegui ler este recorte.', confidence: 0 };
      this.selection.ocr = item;
      this.selection.reading = false;
      this.showSelection(item);
      this.setStatus('Texto lido. Toque noutro sítio ou no X para escolher outro prato.');
    } catch (error) {
      this.selection.reading = false;
      this.showSelection({ text: this.scanErrorMessage(error), confidence: 0 });
    } finally {
      this.layoutHit();
    }
  }

  showSelection(item) {
    const panel = this.$('[data-selection]');
    if (!panel) return;
    panel.hidden = false;
    panel.replaceChildren();

    const title = document.createElement('h2');
    title.className = 'ar__selection-title';
    title.textContent = item.translated_name || item.text || 'Prato';

    const original = document.createElement('p');
    original.className = 'ar__selection-original';
    original.textContent = item.pending ? '' : item.text || '';

    const meta = document.createElement('p');
    meta.className = 'ar__selection-meta';
    if (item.pending) {
      meta.textContent = 'OCR só deste recuadro.';
    } else if (item.match) {
      const confidence = item.match.low_confidence ? 'confiança baixa' : 'casado com a base';
      meta.textContent = `${confidence} · ${item.match.score}%`;
    } else {
      const pct = Math.round((item.confidence || 0) * 100);
      meta.textContent = pct
        ? `Texto lido · ${pct}% de confiança.`
        : 'Ainda sem casamento com a base.';
    }

    panel.append(title, original, meta);
  }

  scanErrorMessage(error) {
    const code = error?.code || error?.name;
    if (code === 'VIDEO_NOT_READY') {
      return 'A câmara ainda não enviou um quadro. Espere um instante e tente de novo.';
    }
    if (code === 'TimeoutError' || code === 'AbortError') {
      return 'A leitura demorou demasiado. Tente aproximar o recuadro.';
    }
    if (code === 'ocr_unavailable') {
      return 'O servidor ainda não tem o motor de leitura. Confirme o contentor do backend.';
    }
    return error?.message || 'Não foi possível ler este recorte.';
  }

  unmount() {
    this.stopTracking();
    this.tracker.clear();
    this.detector?.dispose();
    window.removeEventListener('resize', this.onResize);
    this.renderer?.setAnimationLoop(null);
    stopStream(this.stream);
    this.renderer?.dispose();
    super.unmount();
  }
}
