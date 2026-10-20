'use strict';
function localWindow(window) {
  window.removeMenu();
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
module.exports = { localWindow };
