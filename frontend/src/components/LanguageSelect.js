import { Component } from '../core/component.js';
import { store } from '../core/store.js';

const OPTIONS = [
  { code: 'pt-BR', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
];

export class LanguageSelect extends Component {
  render() {
    const current = store.get().language;
    const items = OPTIONS.map(
      (opt) =>
        `<option value="${opt.code}" ${opt.code === current ? 'selected' : ''}>${opt.label}</option>`,
    ).join('');

    return `
      <label class="lang-select">
        <span class="visually-hidden">Idioma</span>
        <select class="form-select form-select-sm lang-select__control" aria-label="Idioma da interface">
          ${items}
        </select>
      </label>
    `;
  }

  bind() {
    this.$('select').addEventListener('change', (event) => {
      store.set({ language: event.target.value });
    });
  }
}
