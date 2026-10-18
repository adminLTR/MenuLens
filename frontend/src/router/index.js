const routes = {};

export function registerRoute(path, factory) {
  routes[path] = factory;
}

export function navigate(path) {
  if (location.hash.replace(/^#/, '') === path) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  location.hash = path;
}

export function currentPath() {
  const hash = location.hash.replace(/^#/, '');
  return hash || '/';
}

export function startRouter(onRoute) {
  const resolve = () => {
    const path = currentPath();
    const factory = routes[path] || routes['/'];
    onRoute(path, factory);
  };

  window.addEventListener('hashchange', resolve);
  resolve();
}
