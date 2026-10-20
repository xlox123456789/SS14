'use strict';
const M = require('../../vendor/coffeebns/model-core.cjs');
const {allChecks} = require('../board/store');
// Small desktop adaptation of analyze.js usePick: omit page/solver side effects.
function pickModel(raw, base, fresh, checks) {
  let model = M.normalize(base);
  if (fresh || !base) {
    const again = model.runStart && model.step === 'choice';
    const keep = { mode:model.mode, rewards:model.rewards, maxDays:model.maxDays, runStart:true,
      objective:again ? model.objective : 'other', walkTiles:again ? model.walkTiles : 0, startEvent:again ? model.startEvent : 'none' };
    model = M.normalize(Object.assign(M.blankModel(),keep));
  }
  model.step='choice'; model.choice={kind:'tool',options:raw.cards.map(c=>c.sim),rerolls:raw.reroll?1:0,picks:1};
  return { ok:true,raw,model,checks:[...(fresh || !base ? allChecks() : checks || allChecks()),'choice'],notes:[] };
}
module.exports={pickModel};
