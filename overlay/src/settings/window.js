'use strict';
const { BrowserWindow } = require('electron');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { localWindow } = require('../shared/window-security');
class SettingsWindow extends EventEmitter {
  constructor({ icon, screen }) { super(); this.icon = icon; this.screen = screen; this.window = null; this.disposing = false; }
  open() {
    if (!this.window || this.window.isDestroyed()) {
      const area = this.screen.getPrimaryDisplay().workArea;
      this.window = new BrowserWindow({ width: Math.min(this.width || 760, area.width), height: Math.min(850, area.height), minWidth: 600, minHeight: 600,
        x: area.x + 24, y: area.y + Math.min(40, Math.max(0, area.height - 850)), show: false,
        backgroundColor: '#121821', title: this.title || '設定 · SS14小浮層', icon: this.icon,
        webPreferences: { preload: path.join(__dirname, '../shared/preload.js'), contextIsolation: true, sandbox: true },
      });
      localWindow(this.window);
      this.window.on('close', event => { if (!this.disposing) { event.preventDefault(); this.window.hide(); } });
      this.window.webContents.on('did-finish-load', () => this.emit('ready'));
      this.window.once('ready-to-show', () => { if (!this.disposing) { this.window.show(); this.window.focus(); } });
      this.window.loadFile(this.page || path.join(__dirname, 'index.html'));
    } else {
      if (this.window.isMinimized()) this.window.restore();
      this.window.show(); this.window.focus(); this.emit('ready');
    }
  }
  publish(snapshot) { if (this.window && !this.window.isDestroyed() && this.window.isVisible()) this.window.webContents.send('app:state-changed', snapshot); }
  dispose() { this.disposing = true; }
}
module.exports = { SettingsWindow };
