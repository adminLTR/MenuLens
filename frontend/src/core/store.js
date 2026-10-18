const KEY = 'menulens.session';

function readUser() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

class Store {
  constructor() {
    this.state = {
      language: 'pt-BR',
      user: readUser(),
    };
    this.listeners = new Set();
  }

  get() {
    return this.state;
  }

  set(partial) {
    this.state = { ...this.state, ...partial };

    if ('user' in partial) {
      if (partial.user) sessionStorage.setItem(KEY, JSON.stringify(partial.user));
      else sessionStorage.removeItem(KEY);
    }

    this.listeners.forEach((fn) => fn(this.state));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const store = new Store();
