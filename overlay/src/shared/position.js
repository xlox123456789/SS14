'use strict';
function visiblePosition({ saved, width, height, primary, areas }) {
  const savedArea = saved && areas.find(a => saved.x + 60 > a.x && saved.x < a.x + a.width - 60 && saved.y >= a.y && saved.y < a.y + a.height - 40);
  const area = savedArea || primary;
  const point = savedArea ? saved : { x: area.x + area.width - width - 24, y: area.y + 80 };
  return {
    x: Math.round(Math.max(area.x, Math.min(point.x, area.x + Math.max(0, area.width - width)))),
    y: Math.round(Math.max(area.y, Math.min(point.y, area.y + Math.max(0, area.height - height)))),
  };
}
module.exports = { visiblePosition };
