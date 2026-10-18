import { Component } from '../core/component.js';
import {
  createRenderer,
  createScene,
  startWebXRAR,
  startCameraFallback,
  stopStream,
  isWebXRARAvailable,
} from '../services/xr.js';

export class ArView extends Component {
  constructor() {
    super();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.session = null;
    this.stream = null;
    this.frameId = null;
  }

  render() {
    return `
      <section class="ar">
        <video class="ar__video" data-video playsinline muted autoplay hidden></video>
        <canvas class="ar__canvas" data-canvas></canvas>
        <div class="ar__hud">
          <p class="ar__status" data-status>A câmara abre neste aparelho. Aponte para o cardápio quando estiver pronto.</p>
          <div class="ar__actions">
            <button class="btn btn-primary btn-lg" type="button" data-start-xr>Abrir câmara AR</button>
            <button class="btn btn-outline-light" type="button" data-start-cam hidden>Usar câmara neste computador</button>
          </div>
        </div>
      </section>
    `;
  }

  async bind() {
    const canvas = this.$('[data-canvas]');
    this.renderer = createRenderer(canvas);
    const { scene, camera } = createScene();
    this.scene = scene;
    this.camera = camera;

    this.onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this.onResize);

    this.renderer.setAnimationLoop(() => {
      this.renderer.render(this.scene, this.camera);
    });

    const xrOk = await isWebXRARAvailable();
    const camBtn = this.$('[data-start-cam]');
    if (!xrOk) {
      camBtn.hidden = false;
      this.setStatus(
        'A AR pelo WebXR pede Chrome no Android. Neste computador você já pode ligar a câmara para testar o enquadramento.',
      );
    }

    this.$('[data-start-xr]').addEventListener('click', () => this.openXR());
    camBtn.addEventListener('click', () => this.openCamera());
  }

  setStatus(text) {
    const el = this.$('[data-status]');
    if (el) el.textContent = text;
  }

  async openXR() {
    this.setStatus('A pedir acesso à câmara…');
    try {
      const overlay = document.getElementById('xr-overlay');
      this.session = await startWebXRAR(this.renderer, overlay);
      this.session.addEventListener('end', () => {
        this.session = null;
        this.setStatus('Sessão encerrada. Pode abrir de novo quando quiser.');
        this.$('.ar__hud').hidden = false;
      });
      this.$('.ar__hud').hidden = true;
      this.setStatus('Câmara aberta. Aponte para a mesa.');
    } catch (error) {
      if (error.code === 'WEBXR_UNAVAILABLE') {
        this.setStatus(
          'Este aparelho ainda não abre a AR do WebXR. No Android, use o Chrome em HTTPS. Ou ligue a câmara abaixo para testar.',
        );
        this.$('[data-start-cam]').hidden = false;
        return;
      }
      this.setStatus('Não foi possível abrir a AR. Confirme a permissão da câmara e tente de novo.');
    }
  }

  async openCamera() {
    try {
      const video = this.$('[data-video]');
      this.stream = await startCameraFallback(video);
      video.hidden = false;
      this.$('.ar__hud').hidden = true;
      this.setStatus('Câmara ligada. Este modo é só para testar o enquadramento.');
    } catch {
      this.setStatus('A câmara foi recusada. Permita o acesso nas definições do navegador.');
    }
  }

  unmount() {
    window.removeEventListener('resize', this.onResize);
    this.renderer?.setAnimationLoop(null);
    this.session?.end?.();
    stopStream(this.stream);
    this.renderer?.dispose();
    super.unmount();
  }
}
