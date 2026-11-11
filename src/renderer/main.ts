import './index.css';
import '@/assets/css/mobile.css';
import 'animate.css';
import 'remixicon/fonts/remixicon.css';

import { createApp } from 'vue';

import i18n from '@/../i18n/renderer';
import router from '@/router';
import { getAndroidEmbeddedApiBaseUrl } from '@/services/androidEmbeddedApi';
import pinia from '@/store';
import { isAndroidApp, isElectron } from '@/utils';

import App from './App.vue';
import directives from './directive';

// Web 端注册最小 Service Worker，使站点满足 PWA 可安装条件（#640/#382）
if (!isElectron && !isAndroidApp && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[PWA] Service Worker 注册失败:', error);
    });
  });
}

// Start the on-device API while the interface renders. API requests share this
// promise and wait for the embedded service to report its loopback port.
if (isAndroidApp) {
  void getAndroidEmbeddedApiBaseUrl().catch((error) => {
    console.error('[Android API] Embedded music service failed to start:', error);
  });
}

const app = createApp(App);

Object.keys(directives).forEach((key: string) => {
  app.directive(key, directives[key as keyof typeof directives]);
});

app.use(pinia);
app.use(router);
app.use(i18n as any);
app.mount('#app');
