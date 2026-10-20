// CoffeeBns analyze.js bestMove, extracted verbatim by scripts/extract-upstream-strategy.cjs.
'use strict';
const S=require('./js/solver');
const LIVE_MIN=150,SWITCH_MIN=0.05;
module.exports=function(solver){
  function bestMove() {
    if (!solver.st) return null;
    const pick = solver.instant;
    const r = solver.result;
    const ranked = r ? r.options : [];
    // A check cut short by the time cap (early) leads only with LIVE_MIN
    // playouts each; with fewer, the strategy's own pick stands (f5's review).
    const live = r && ranked.length > 1 && ((r.done && !r.early) || r.rounds >= LIVE_MIN) ? ranked[0] : null;
    const mine = pick && ranked.find((o) => S.sameAction(o.action, pick.action));
    if (!live) return pick ? Object.assign({ live: false }, pick, { option: mine || null }) : ranked.length === 1 ? { action: ranked[0].action, label: ranked[0].label, why: 'It’s the only move here.', live: true, option: ranked[0] } : null;
    // A better move must also win by a margin worth playing for: shared dice
    // make the paired margin narrow, and a near tie flipped the advice from
    // one screen to the next (report 337: End 2.85 against the strategy's
    // consume at 2.82).
    if (mine && (mine === live || live.mean - mine.mean <= Math.max(1.96 * mine.gapSe, SWITCH_MIN))) {
      const why = mine === live ? pick.why : `${pick.why} The live check rates it about equal to the best.`;
      return Object.assign({ live: true, rounds: r.rounds }, pick, { label: mine.label, why, option: mine });
    }
    return { action: live.action, label: live.label, why: `The playouts found a better move than the strategy’s pick${pick ? ` (${pick.label})` : ''}.`, live: true, rounds: r.rounds, option: live };
  }
return bestMove();
};
