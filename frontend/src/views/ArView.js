import { Component } from '../core/component.js';
import {
  createRenderer,
  createScene,
  startCameraFallback,
  stopStream,
} from '../services/xr.js';
import { prepareVideoFrame, snapshotToBlob, unprojectCoverPoint } from '../services/menuScan.js';
import { warpMenu } from '../services/menuDetect.js';
import { createMenuDetector } from '../services/menuDetectClient.js';
import { createMenuEnhancer } from '../services/menuEnhanceClient.js';

export class ArView extends Component {
  constructor() {
    super();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.stream = null;
    this.detector = null;
    this.enhancer = null;
    this.picking = false;
    this.captureMode = 'new';
    this.pages = [];
    this.pageIndex = 0;
    this.cardOpen = false;
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
          <img class="menu-card__image" data-card-image alt="Página do cardápio">
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

    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
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

  async captureAtEvent(event) {
    if (this.picking) return;
    const overlay = this.$('[data-overlay]');
    const video = this.$('[data-video]');
    const snapshot = this.$('[data-snapshot]');
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
    this.setStatus('A procurar as bordas do cardápio…');
    try {
      prepareVideoFrame(video, snapshot, { maxSide: 2000 });
      const scale = Math.min(1, 640 / snapshot.width);
      const width = Math.max(1, Math.round(snapshot.width * scale));
      const height = Math.max(1, Math.round(snapshot.height * scale));
      const tmp = document.createElement('canvas');
      tmp.width = width;
      tmp.height = height;
      tmp.getContext('2d').drawImage(snapshot, 0, 0, width, height);
      const bitmap = await createImageBitmap(tmp);
      const corners = await this.detector.detect(bitmap, point);
      if (!corners) {
        this.setStatus('Não encontrei as bordas. Aproxime o papel, toque no centro da folha e tente de novo.');
        return;
      }
      const context = snapshot.getContext('2d', { willReadFrequently: true });
      const imageData = context.getImageData(0, 0, snapshot.width, snapshot.height);
      const warped = warpMenu(imageData, corners);
      if (!warped) {
        this.setStatus('Recortei as bordas, mas não consegui endireitar a página. Tente de frente.');
        return;
      }
      const warpCtx = warped.getContext('2d', { willReadFrequently: true });
      const warpedPixels = warpCtx.getImageData(0, 0, warped.width, warped.height);
      const enhanced = await this.enhancer.enhance(warpedPixels);
      if (enhanced) warpCtx.putImageData(enhanced, 0, 0);
      const blob = await snapshotToBlob(warped, { quality: 0.93 });
      const url = URL.createObjectURL(blob);
      const page = { url, width: warped.width, height: warped.height };
      this.commitPage(page);
      this.openCard();
    } catch {
      this.setStatus('Não foi possível capturar esta página. Tente outra vez.');
    } finally {
      this.picking = false;
    }
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
  }

  unmount() {
    this.pages.forEach((item) => URL.revokeObjectURL(item.url));
    this.detector?.dispose();
    this.enhancer?.dispose();
    window.removeEventListener('resize', this.onResize);
    this.renderer?.setAnimationLoop(null);
    stopStream(this.stream);
    this.renderer?.dispose();
    super.unmount();
  }
}
