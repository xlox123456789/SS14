'use strict';
// Confirmed in this user's real UE_game.log and backup logs on 2026-10-19.
// These Page@ events coexist with CoffeeBns' detailed TLLua/TLGame events.
// Exact observed views only: no inferred combat/reward event names.
const PAGE_RULES=[
  {kind:'board',pattern:'\\[Game\\] Page@ OpenView S16BoardMain\\s*$',settle:1500,rank:1},
  {kind:'skip',pattern:'\\[Game\\] Page@ OpenView S16BoardNewDayPop\\s*$',settle:100,rank:1},
  {kind:'board',pattern:'\\[Game\\] Page@ CloseView \\d+_S16BoardNewDayPopCtrl\\s*$',settle:1500,rank:1},
];
module.exports={PAGE_RULES};
