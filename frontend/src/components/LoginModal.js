import { Modal } from 'bootstrap';
import { Component } from '../core/component.js';
import { store } from '../core/store.js';

export class LoginModal extends Component {
  render() {
    return `
      <div class="modal fade" id="loginModal" tabindex="-1" aria-labelledby="loginModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content login-card">
            <div class="modal-header border-0 pb-0">
              <h2 class="modal-title font-display" id="loginModalLabel">Entrar no MenuLens</h2>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
              <p class="login-card__lead">
                Com uma conta, o cardápio já nasce combinado com o seu gosto e as suas alergias.
                Sem conta, você também usa — só não recebe sugestões.
              </p>
              <form class="login-form" novalidate>
                <div class="mb-3">
                  <label class="form-label" for="login-email">E-mail</label>
                  <input class="form-control" id="login-email" name="email" type="email" autocomplete="username" required placeholder="você@email.com" />
                </div>
                <div class="mb-3">
                  <label class="form-label" for="login-password">Senha</label>
                  <input class="form-control" id="login-password" name="password" type="password" autocomplete="current-password" required minlength="6" placeholder="••••••••" />
                </div>
                <p class="login-form__hint" data-login-error hidden></p>
                <button class="btn btn-primary w-100" type="submit">Entrar</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  bind() {
    this.modal = new Modal(this.el);

    this.$('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const errorEl = this.$('[data-login-error]');
      const email = form.email.value.trim();
      const password = form.password.value;

      if (!form.checkValidity()) {
        errorEl.hidden = false;
        errorEl.textContent = 'Preencha um e-mail válido e uma senha com pelo menos 6 caracteres.';
        return;
      }

      store.set({
        user: {
          email,
          name: email.split('@')[0],
        },
      });

      form.reset();
      errorEl.hidden = true;
      this.close();
    });
  }

  open() {
    this.modal.show();
  }

  close() {
    this.modal.hide();
  }
}
