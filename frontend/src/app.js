import { AppLayout } from './layouts/AppLayout.js';
import { HomeView } from './views/HomeView.js';
import { ArView } from './views/ArView.js';
import { registerRoute, startRouter } from './router/index.js';

export function boot() {
  const layout = new AppLayout();
  layout.mount('#app');

  registerRoute('/', () => new HomeView());
  registerRoute('/ar', () => new ArView());

  startRouter((path, factory) => layout.setView(path, factory));
}
