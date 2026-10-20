'use strict';
function normalizeShortcut(value) {
  if (typeof value !== 'string' || value.length > 80) throw new Error('請設定有效的截圖快捷鍵。');
  const parts = value.split('+').map(s => s.trim()).filter(Boolean);
  const aliases = { ctrl: 'Control', control: 'Control', alt: 'Alt', shift: 'Shift' };
  const modifiers = new Set(); let key;
  for (const part of parts) {
    const modifier = aliases[part.toLowerCase()];
    if (modifier) {
      if (modifiers.has(modifier)) throw new Error('快捷鍵的修飾鍵不能重複。');
      modifiers.add(modifier);
    } else if (!key && /^(F(?:[1-9]|1\d|2[0-4])|[A-Z0-9])$/i.test(part)) key = part.toUpperCase();
    else throw new Error('請使用 F1～F24，或 Ctrl／Alt／Shift 搭配英文字母與數字。');
  }
  if (!key || (!/^F\d+$/.test(key) && !modifiers.has('Control') && !modifiers.has('Alt'))) throw new Error('字母或數字快捷鍵必須搭配 Ctrl 或 Alt。');
  const normalized = ['Control', 'Alt', 'Shift'].filter(m => modifiers.has(m)).concat(key).join('+');
  if (['Control+Alt+O', 'Alt+F4', 'Control+W', 'Control+Q'].includes(normalized)) throw new Error('這組快捷鍵已保留，請選擇其他組合。');
  return normalized;
}
module.exports = { normalizeShortcut };
