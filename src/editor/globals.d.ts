/// <reference types="vite/client" />

import type { ProxyAPI } from '../shared/model.js';

declare global {
  interface Window { proxy: ProxyAPI }
}

export {};
