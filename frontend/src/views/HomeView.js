import { Component } from '../core/component.js';
import { navigate } from '../router/index.js';

export class HomeView extends Component {
  render() {
    return `
      <article class="home">
        <section class="hero">
          <div class="hero__copy">
            <p class="eyebrow">No restaurante, no seu idioma</p>
            <h1 class="hero__title">O cardápio deixa de ser um mistério. O prato aparece na sua mesa.</h1>
            <p class="hero__lead">
              Aponte o celular para o menu. O MenuLens mostra o que cada prato é, do que é feito
              e como fica — para você pedir com confiança, mesmo sem falar a língua do restaurante.
            </p>
            <div class="hero__actions">
              <a class="btn btn-primary btn-lg" href="#/ar" data-go-ar>Abrir o cardápio agora</a>
              <button class="btn btn-outline-dark btn-lg" type="button" data-go-login>Entrar na minha conta</button>
            </div>
            <p class="hero__note">Sem cadastro também funciona. A conta só deixa as sugestões mais suas.</p>
          </div>
          <div class="hero__stage" aria-hidden="true">
            <div class="plate">
              <div class="plate__dish"></div>
              <div class="plate__card plate__card--one">Moqueca</div>
              <div class="plate__card plate__card--two">sem camarão</div>
            </div>
          </div>
        </section>

        <section class="steps">
          <h2 class="section-title">Três gestos. O jantar resolvido.</h2>
          <ol class="steps__grid">
            <li>
              <span class="steps__num">1</span>
              <h3>Aponte</h3>
              <p>Abra a câmara sobre o cardápio impresso. Os pratos viram cartões que você entende.</p>
            </li>
            <li>
              <span class="steps__num">2</span>
              <h3>Escolha</h3>
              <p>Toque no nome que despertou curiosidade. Tradução, ingredientes e alergias vêm junto.</p>
            </li>
            <li>
              <span class="steps__num">3</span>
              <h3>Veja na mesa</h3>
              <p>O prato aparece em 3D no tampo. Gire, olhe de perto e peça o que realmente quer.</p>
            </li>
          </ol>
        </section>

        <section class="perks">
          <h2 class="section-title">O que você leva para a mesa</h2>
          <div class="perks__grid">
            <article class="perk">
              <h3>O prato, não só o nome</h3>
              <p>Uma imagem de referência e um modelo na mesa, para você saber o que chega antes de pedir.</p>
            </article>
            <article class="perk">
              <h3>Ingredientes à vista</h3>
              <p>O que vai dentro, escrito com clareza. Nada de surpresa no molho.</p>
            </article>
            <article class="perk">
              <h3>Alergias no primeiro olhar</h3>
              <p>O que pode fazer mal aparece marcado. Você recusa o prato errado sem precisar perguntar.</p>
            </article>
            <article class="perk">
              <h3>O essencial da nutrição</h3>
              <p>Energia e gorduras em linguagem simples, para escolher entre o leve e o substancioso.</p>
            </article>
            <article class="perk">
              <h3>Do seu jeito</h3>
              <p>Picante, salgado, doce, com ou sem álcool. Com perfil, o cardápio destaca o que combina com você.</p>
            </article>
            <article class="perk">
              <h3>Qualquer página do menu</h3>
              <p>Entradas, principais, bebidas. Aponte para a folha da vez e continue a escolher.</p>
            </article>
          </div>
        </section>

        <section class="close">
          <div class="close__panel">
            <h2>Hoje o cardápio está em outra língua. Isso não precisa impedir o jantar.</h2>
            <p>Abra a câmara, aponte para o papel e escolha como quem já conhece a casa.</p>
            <a class="btn btn-primary btn-lg" href="#/ar" data-go-ar>Começar sem cadastro</a>
          </div>
        </section>
      </article>
    `;
  }

  bind() {
    this.$$('[data-go-ar]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        navigate('/ar');
      });
    });

    this.$('[data-go-login]').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('menulens:login'));
    });
  }
}
