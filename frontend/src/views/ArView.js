import { Component } from '../core/component.js';
import {
  createRenderer,
  createScene,
  startCameraFallback,
  stopStream,
} from '../services/xr.js';

export class ArView extends Component {
  constructor() {
    super();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.stream = null;
  }

  render() {
    return `
      <section class="ar">
        <video class="ar__video" data-video playsinline muted autoplay hidden></video>
        <canvas class="ar__canvas" data-canvas></canvas>
        <div class="ar__hud">
          <p class="ar__status" data-status></p>
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
    this.describeContext();
  }

  describeContext() {
    if (window.isSecureContext) {
      this.setStatus('Aponte para o cardápio e toque em Abrir câmara. O Chrome vai pedir permissão nesta página.');
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
      this.$('.ar__hud').hidden = true;
    } catch (error) {
      this.setStatus(this.cameraErrorMessage(error));
    }
  }

  unmount() {
    window.removeEventListener('resize', this.onResize);
    this.renderer?.setAnimationLoop(null);
    stopStream(this.stream);
    this.renderer?.dispose();
    super.unmount();
  }
}
