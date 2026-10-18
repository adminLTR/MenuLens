export class Component {
  constructor(props = {}) {
    this.props = props;
    this.el = null;
    this.children = [];
  }

  render() {
    throw new Error(`${this.constructor.name} precisa implementar render()`);
  }

  bind() {}

  mount(target) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    const markup = this.render();

    if (typeof markup === 'string') {
      const wrap = document.createElement('div');
      wrap.innerHTML = markup.trim();
      this.el = wrap.firstElementChild;
    } else {
      this.el = markup;
    }

    host.appendChild(this.el);
    this.bind();
    return this.el;
  }

  unmount() {
    this.children.forEach((child) => child.unmount?.());
    this.el?.remove();
    this.el = null;
  }

  $(selector) {
    return this.el.querySelector(selector);
  }

  $$(selector) {
    return [...this.el.querySelectorAll(selector)];
  }
}
