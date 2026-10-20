const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 640, height: 480, x: 40, y: 50, title: '浮層截圖測試視窗', autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true } });
  win.removeMenu();
  const html = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>浮層截圖測試視窗</title></head><body style="margin:0;background:#164c65;color:white;font:28px sans-serif"><div style="padding:40px">視窗截圖驗證</div><div style="width:180px;height:150px;background:#e9a348;margin:20px 40px">測試色塊</div></body></html>';
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});
app.on('window-all-closed', () => app.quit());
