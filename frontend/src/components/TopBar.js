import { Component } from '../core/component.js';
import { LanguageSelect } from './LanguageSelect.js';
import { store } from '../core/store.js';
import { navigate } from '../router/index.js';

export class TopBar extends Component {
  constructor(props) {
    super(props);
    this.languageSelect = new LanguageSelect();
    this.children.push(this.languageSelect);
    this.unsubscribe = store.subscribe(() => this.syncAuth());
  }

  render() {
    return `
      <header class="topbar">
        <a class="topbar__brand" href="#/" data-link-home>
          <span class="topbar__mark" aria-hidden="true"></span>
          <span class="topbar__name">MenuLens</span>
        </a>
        <div class="topbar__tools" data-topbar-tools></div>
      </header>
    `;
  }

  bind() {
    this.languageSelect.mount(this.$('[data-topbar-tools]'));

    const authHost = document.createElement('div');
    authHost.className = 'topbar__auth';
    authHost.dataset.auth = '';
    this.$('[data-topbar-tools]').appendChild(authHost);

    this.$('[data-link-home]').addEventListener('click', (event) => {
      event.preventDefault();
      navigate('/');
    });

    this.syncAuth();
  }

  syncAuth() {
    const host = this.$('[data-auth]');
    if (!host) return;

    const { user } = store.get();
    host.innerHTML = user
      ? `
        <span class="topbar__user">${user.name}</span>
        <button class="btn btn-ghost btn-sm" type="button" data-logout>Sair</button>
      `
      : `
        <button class="btn btn-ghost btn-sm" type="button" data-login>Entrar</button>
      `;

    host.querySelector('[data-login]')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('menulens:login'));
    });

    host.querySelector('[data-logout]')?.addEventListener('click', () => {
      store.set({ user: null });
    });
  }

  unmount() {
    this.unsubscribe?.();
    super.unmount();
  }
}
