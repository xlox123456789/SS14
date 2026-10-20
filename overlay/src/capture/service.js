'use strict';
const { BrowserWindow, desktopCapturer, session, webContents } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { localWindow } = require('../shared/window-security');

class CaptureError extends Error {}
class CaptureService {
  constructor({ folder }) {
    this.folder = folder; this.window = null; this.busy = false; this.activeSource = null;
    this.pageURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      const owned = this.window && !this.window.isDestroyed() && request.frame === this.window.webContents.mainFrame &&
        request.frame.url === this.pageURL && webContents.fromFrame(request.frame) === this.window.webContents;
      callback(owned && this.busy && this.activeSource ? { video: this.activeSource } : {});
    });
  }
  async sources() {
    const ownHandles = new Set(BrowserWindow.getAllWindows().filter(w => !w.isDestroyed()).map(w => {
      const handle = w.getNativeWindowHandle();
      return String(handle.length >= 8 ? handle.readBigUInt64LE(0) : handle.readUInt32LE(0));
    }));
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    return sources.filter(s => s.name.trim() && !ownHandles.has(s.id.split(':')[1]));
  }
  async listWindows() {
    try { return (await this.sources()).map(s => ({ id: s.id, title: s.name.trim() })).sort((a, b) => a.title.localeCompare(b.title, 'zh-TW')); }
    catch { throw new CaptureError('無法取得視窗清單，請稍後重新整理。'); }
  }
  async resolveTarget(target) {
    if (!target || typeof target.id !== 'string' || typeof target.title !== 'string') throw new CaptureError('請先在設定中選擇遊戲視窗。');
    const sources = await this.sources();
    const same = sources.find(s => s.id === target.id && s.name.trim() === target.title);
    if (same) return same;
    const named = sources.filter(s => s.name.trim() === target.title);
    if (named.length === 1) return named[0];
    throw new CaptureError(named.length > 1 ? '找到多個同名視窗，請在設定中重新選擇。' : '找不到選定的遊戲視窗。請開啟遊戲並取消最小化，再重新選擇。');
  }
  async ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return;
    this.window = new BrowserWindow({ show: false, width: 320, height: 200, skipTaskbar: true,
      title: '截圖處理', webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    localWindow(this.window);
    await this.window.loadFile(path.join(__dirname, 'index.html'));
  }
  async take(target) {
    if (this.busy) throw new CaptureError('正在截圖，請稍候。');
    this.busy = true;
    let timer;
    try {
      this.activeSource = await this.resolveTarget(target);
      if(this.probeSourceId&&this.probeSourceId!==this.activeSource.id)await this.stopProbe();
      await this.ensureWindow();
      const result = await Promise.race([
        this.window.webContents.executeJavaScript('window.captureFrame()', true),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new CaptureError('截圖逾時。請確認遊戲未最小化，然後重試。')), 12000); }),
      ]);
      if (!result?.ok) throw new CaptureError(result?.error || '無法讀取遊戲畫面，請重試。');
      if (typeof result.dataUrl !== 'string' || result.dataUrl.length > 64 * 1024 * 1024 || !result.dataUrl.startsWith('data:image/png;base64,')) throw new CaptureError('截圖資料不正確或過大。');
      // The trusted capture page already encoded PNG. Do not decode/re-encode
      // millions of pixels on Electron's main thread.
      const png=Buffer.from(result.dataUrl.slice('data:image/png;base64,'.length),'base64');
      if(png.length<24 || !png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new CaptureError('截圖資料格式不正確。');
      const size={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
      if(!size.width||!size.height||size.width*size.height>40000000)throw new CaptureError('截圖尺寸不正確或過大。');
      await fs.mkdir(this.folder, { recursive: true });
      const imagePath = path.join(this.folder, 'latest.png');
      await fs.writeFile(`${imagePath}.tmp`, png);
      await fs.rename(`${imagePath}.tmp`, imagePath);
      return { id: randomUUID(), width: size.width, height: size.height, sourceTitle: this.activeSource.name.trim(), capturedAt: new Date().toISOString(), imagePath, dataUrl: result.dataUrl };
    } catch (error) {
      // Destroying a failed capture page releases any stream awaiting a frame.
      if (this.window && !this.window.isDestroyed()) this.window.destroy();
      this.window = null;
      if (error instanceof CaptureError) throw error;
      console.error('Capture failed:', error);
      throw new CaptureError('截圖失敗。請確認遊戲未最小化，並以視窗或無邊框模式執行。');
    } finally { clearTimeout(timer); this.activeSource = null; this.busy = false; }
  }
  async startProbe(target){
    if(this.busy)throw new CaptureError('正在截圖，請稍候。');
    this.busy=true;
    try{
      this.activeSource=await this.resolveTarget(target);await this.ensureWindow();
      const result=await this.window.webContents.executeJavaScript('window.startDecisionProbe()',true);
      if(!result.ok)throw new CaptureError(result.error);
      this.probeSourceId=this.activeSource.id;
    }finally{this.busy=false;this.activeSource=null;}
  }
  async probe(){return this.window&&!this.window.isDestroyed()?this.window.webContents.executeJavaScript('window.decisionProbe()'):null;}
  stopProbe(){this.probeSourceId=null;return this.window&&!this.window.isDestroyed()?this.window.webContents.executeJavaScript('window.stopDecisionProbe()').catch(()=>{}):Promise.resolve();}
  dispose() {this.stopProbe();if (this.window && !this.window.isDestroyed()) this.window.destroy(); }
}
module.exports = { CaptureService };
