import { Component } from '../core/component.js';
import { TopBar } from '../components/TopBar.js';
import { LoginModal } from '../components/LoginModal.js';

export class AppLayout extends Component {
  constructor() {
    super();
    this.loginModal = new LoginModal();
    this.topbar = new TopBar();
    this.children.push(this.topbar, this.loginModal);
    this.currentView = null;
  }

  render() {
    return `
      <div class="app-shell">
        <div id="xr-overlay" class="xr-overlay">
          <div data-topbar-slot></div>
        </div>
        <main class="app-outlet" data-outlet></main>
        <div data-modal-slot></div>
      </div>
    `;
  }

  bind() {
    this.topbar.mount(this.$('[data-topbar-slot]'));
    this.loginModal.mount(this.$('[data-modal-slot]'));
    this.outlet = this.$('[data-outlet]');
    this.onLoginRequest = () => this.loginModal.open();
    window.addEventListener('menulens:login', this.onLoginRequest);
  }

  setView(path, factory) {
    document.body.classList.toggle('is-ar', path === '/ar');
    this.currentView?.unmount?.();
    this.outlet.innerHTML = '';
    this.currentView = factory();
    this.currentView.mount(this.outlet);
  }
}
