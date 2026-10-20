'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('overlayApp', {
  getState: () => ipcRenderer.invoke('app:state'),
  getPreview:id=>ipcRenderer.invoke('capture:preview',id),
  getDiagnostics:()=>ipcRenderer.invoke('diagnostics:get'),
  copyDiagnostics:()=>ipcRenderer.invoke('diagnostics:copy'),
  onDiagnostics:callback=>{const listener=(_event,snapshot)=>callback(snapshot);ipcRenderer.on('diagnostics:changed',listener);return ()=>ipcRenderer.removeListener('diagnostics:changed',listener);},
  openSettings: () => ipcRenderer.invoke('settings:open'),
  findLog: () => ipcRenderer.invoke('auto:find-log'),
  chooseLog: () => ipcRenderer.invoke('auto:choose-log'),
  openCredit: name => ipcRenderer.invoke('credits:open', name),
  analyzeCapture: () => ipcRenderer.invoke('analysis:take'),
  openBoard: () => ipcRenderer.invoke('board:open'),
  recommend:()=>ipcRenderer.invoke('strategy:recommend'),
  getBoard: () => ipcRenderer.invoke('board:get'),
  editBoard: patch => ipcRenderer.invoke('board:edit', patch),
  reloadBoard: () => ipcRenderer.invoke('board:reload'),
  importBoard: () => ipcRenderer.invoke('board:import'),
  exportBoard: () => ipcRenderer.invoke('board:export'),
  saveSettings: patch => ipcRenderer.invoke('settings:save', patch),
  resetPosition: () => ipcRenderer.invoke('settings:reset-position'),
  hideOverlay: () => ipcRenderer.invoke('overlay:hide'),
  showOverlay: () => ipcRenderer.invoke('overlay:show'),
  listWindows: () => ipcRenderer.invoke('capture:windows'),
  testCapture: target => ipcRenderer.invoke('capture:test', target),
  resize: height => ipcRenderer.send('overlay:height', height),
  onState: callback => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('app:state-changed', listener);
    return () => ipcRenderer.removeListener('app:state-changed', listener);
  },
});
