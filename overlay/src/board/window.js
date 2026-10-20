'use strict';
const { SettingsWindow } = require('../settings/window');
const path = require('node:path');
class BoardWindow extends SettingsWindow {
  constructor(options) { super(options); this.page = path.join(__dirname, 'index.html'); this.title = 'SS14盤面'; this.width = 1160; }
}
module.exports = { BoardWindow };
