import electron = require('electron');
import type { ProxyAPI } from '../shared/model.js';

const { contextBridge, ipcRenderer } = electron;
const bridge: ProxyAPI = {
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
  cardArchive: (name, data) => ipcRenderer.invoke('files:card-archive', name, data)
};
contextBridge.exposeInMainWorld('proxy', bridge);
