import electron = require('electron');
import type { ProxyAPI } from '../shared/model.js';

const { contextBridge, ipcRenderer } = electron;
const bridge: ProxyAPI = {
  getLocale: () => ipcRenderer.invoke('locale:get'),
  setLocale: locale => ipcRenderer.invoke('locale:set', locale),
  checkForUpdate: () => ipcRenderer.invoke('updates:check'),
  openReleases: () => ipcRenderer.invoke('updates:open-releases'),
  fonts: () => ipcRenderer.invoke('fonts:list'),
  projects: () => ipcRenderer.invoke('projects:list'),
  open: id => ipcRenderer.invoke('projects:open', id),
  save: project => ipcRenderer.invoke('projects:save', project),
  search: name => ipcRenderer.invoke('catalog:search', name),
  printings: id => ipcRenderer.invoke('catalog:printings', id),
  card: (id, includeImages = true) => ipcRenderer.invoke('catalog:card', id, includeImages),
  resolve: entries => ipcRenderer.invoke('catalog:resolve', entries),
  deckFile: () => ipcRenderer.invoke('files:deck'),
  images: (mode, frame) => ipcRenderer.invoke('files:images', mode, frame),
  dropped: (data, name, frame) => ipcRenderer.invoke('files:dropped', data, name, frame),
  pdf: (name, data) => ipcRenderer.invoke('files:pdf', name, data),
  beginCardArchive: () => ipcRenderer.invoke('files:begin-card-archive'),
  appendCardArchive: (id, paths, data) => ipcRenderer.invoke('files:append-card-archive', id, paths, data),
  saveCardArchive: (id, name) => ipcRenderer.invoke('files:save-card-archive', id, name),
  discardCardArchive: id => ipcRenderer.invoke('files:discard-card-archive', id)
};
contextBridge.exposeInMainWorld('proxy', bridge);
