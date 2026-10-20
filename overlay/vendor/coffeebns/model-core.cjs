// Generated from CoffeeBns analyze.js by scripts/extract-upstream-model.cjs.
'use strict';
const T = require('./js/engine');
const L = n => T.cellLabel(n);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const toInt = (v, fallback) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : fallback; };
const TOP_TIER = T.SUPREME, TOOL_SURE = 0.9;
const STEPS = ['patrol','manage','office','chain','event','ratway','choice'];
const officeCell = () => ({kind:'office'});
const sealedCell = () => ({kind:'sealed',event:null});
// This scanner has no strategy; never infer an advised instrument pick.
const model = null;
const fresh = () => false;
const recommendation = () => null;
  function cellSig(c) {
    switch (c.kind) {
      case 'inmate': return ['inmate', c.beast, toInt(c.tier, 0), !!c.ivory, c.prey ? [c.prey.cell, c.prey.rounds] : null, c.event || ''].join('|');
      case 'scratch': return ['scratch', toInt(c.tier, 0), c.event || ''].join('|');
      case 'revealed': return ['revealed', toInt(c.tier, 0), c.event || ''].join('|');
      case 'scouted': return ['scouted', c.beast, toInt(c.tier, 0), c.event || ''].join('|');
      case 'sealed': return ['sealed', c.event || '', toInt(c.atLeast, 0)].join('|');
      case 'nest': return ['nest', toInt(c.due, 0)].join('|');
      default: return c.kind;
    }
  }

  function blankModel() {
    return {
      v: 1,
      mode: 'drill',
      // The game has one food chain. Shared boards still say which.
      chain: 'single',
      rewards: true,
      day: 1,
      maxDays: T.DEFAULT_PARAMS.drillDays,
      step: 'patrol',
      warden: T.OFFICE,
      dest: [],
      devourUsed: false,
      swapUsed: false,
      // The game offers a consume after today's swap (it shows the button,
      // or Follow my game saw it in the log): only then is one advised.
      consumeOffered: false,
      // A Warden's Treasure waiting for the board behind it (treasureWait),
      // and the board seen since it opened (treasureSeen).
      treasureWait: false,
      treasureSeen: false,
      // Set when a screenshot's instrument panel disagrees with the run's
      // instruments: the player is asked to confirm them. Once confirmed
      // (toolsLocked), they stay for the run and aren't asked about again.
      toolsToConfirm: '',
      toolsLocked: false,
      // The panel's count at the last confirmation (toolsSeen) and in the
      // last picture (toolsPanel): only a panel showing more asks again.
      toolsSeen: 0,
      toolsPanel: 0,
      // Days of this run whose morning offered a door short (see scanToModel).
      shortDays: [],
      // The game shows no Replace / Consume card now (read from a screenshot):
      // that move isn't advised, and the other one still can be. noHunt: no
      // Hunt (the Blood-Stained Trap) on offer either.
      noSwap: false,
      noDevour: false,
      noHunt: false,
      // The cells the game framed on the Hunt's pick (only those can be
      // marked), while it's open.
      huntOnly: null,
      // The office shows one card only (read from a screenshot): 'bestow' or
      // 'instigate'.
      officeOnly: null,
      eventKind: 'chain',
      // rerolls: a pet's re-rolls left on an instrument offer. picks: the
      // Warden's Treasure picks waiting, this one included (3 a Treasure
      // with Opulence).
      choice: { kind: 'tool', options: [], rerolls: 0, picks: 1 },
      chainArmed: false,
      // Until the player sets it, no objective's tool is assumed.
      objective: 'other',
      // A card shown before the run, besides its objective (T.START_EVENTS).
      startEvent: 'none',
      walkTiles: 0,
      milestone: false,
      tools: [],
      vault: [],
      cells: Array.from({ length: T.CELL_COUNT }, (_, n) => (n === T.OFFICE ? officeCell() : sealedCell())),
    };
  }

  function normalize(m) {
    const base = blankModel();
    if (!m || typeof m !== 'object' || !Array.isArray(m.cells) || m.cells.length !== T.CELL_COUNT) return base;
    const out = Object.assign(base, m);
    // Every board is a drill: the contract challenge is gone (it isn't in
    // the live game), and a board saved in it goes on as a drill.
    out.mode = 'drill';
    delete out.ch;
    delete out.windowKind;
    out.choice = Object.assign(blankModel().choice, m.choice || {});
    out.choice.rerolls = clamp(toInt(out.choice.rerolls, 0), 0, 9);
    out.choice.picks = clamp(toInt(out.choice.picks, 1), 1, 30);
    out.cells = m.cells.map((c, n) => (n === T.OFFICE ? officeCell() : Object.assign(sealedCell(), c)));
    out.dest = Array.isArray(m.dest) ? m.dest.filter((n) => Number.isInteger(n) && n >= 0 && n < T.CELL_COUNT) : [];
    if (!STEPS.includes(out.step)) out.step = 'patrol';
    if (out.objective === 'cagefight') {
      out.startEvent = 'cagefight';
      out.objective = 'other';
    }
    if (!T.START_EVENTS || !T.START_EVENTS[out.startEvent]) out.startEvent = 'none';
    if (!T.OBJECTIVES[out.objective]) out.objective = 'other';
    // Progress on an objective counted to a number (tiles, consumes, ...).
    out.walkTiles = clamp(toInt(out.walkTiles, 0), 0, T.OBJECTIVES[out.objective].need || 0);
    out.chain = 'single';
    return out;
  }

  function buildState(m) {
    const problems = [];
    const params = { rewards: !!m.rewards, drillDays: clamp(toInt(m.maxDays, 20), 5, 60) };
    const st = T.newGame({ params, seed: 'ANALYZER' });
    st.rng = (Math.random() * 4294967296) >>> 0;
    st.log = [];
    st.day = clamp(toInt(m.day, 1), 1, st.maxDays);
    st.nextId = 1;
    const make = (beast, tier) => ({ id: st.nextId++, beast: T.BEASTS.includes(beast) ? beast : 'mammoth', tier: clamp(toInt(tier, 0), 0, TOP_TIER) });
    st.cells = m.cells.map((c, n) => {
      const cell = { n, sealed: n !== T.OFFICE, inmate: null, hidden: null, known: 0, scratch: false, nest: null, event: null, ivory: false };
      if (n === T.OFFICE) return cell;
      // Doors marked with an event ("!") have been passed; the rest may still
      // hide one the player can't see.
      const setEvent = () => {
        cell.seen = !!c.event;
        if (!c.event) return;
        cell.event = T.EVENTS[c.event] ? c.event : 'chain';
        if (c.event === 'unknown') cell.eventKnown = false;
      };
      if (c.kind === 'empty') cell.sealed = false;
      else if (c.kind === 'inmate') {
        cell.sealed = false;
        cell.inmate = make(c.beast, c.tier);
        if (c.marked) cell.inmate.marked = true;
        cell.ivory = !!c.ivory;
        // An event can wait in an open cell ("Can trigger Prison Incident").
        setEvent();
      } else if (c.kind === 'nest') {
        // A nest due today hatched this morning, so a sealed one is due later.
        cell.nest = { due: Math.max(st.day + 1, toInt(c.due, st.day + 1)) };
      } else if (c.kind === 'scouted') {
        cell.known = 2;
        cell.hidden = make(c.beast, c.tier);
        setEvent();
      } else if (c.kind === 'scratch' || c.kind === 'revealed') {
        // The rarity shows; the beast stays hidden (re-rolled by the solver).
        cell.scratch = c.kind === 'scratch';
        cell.known = 1;
        cell.hidden = make(T.BEASTS[Math.floor(Math.random() * 4)], c.tier);
        setEvent();
      } else {
        // A door the "Treasure" Hunt left dark holds Rare or better.
        cell.atLeast = c.kind === 'sealed' ? clamp(toInt(c.atLeast, 0), 0, TOP_TIER) : 0;
        setEvent();
      }
      return cell;
    });

    // Prey marks: a Lion and the same-rarity meal it marked.
    st.prey = [];
    m.cells.forEach((c, n) => {
      if (c.kind !== 'inmate' || c.beast !== 'lion' || !c.prey) return;
      const lion = st.cells[n].inmate;
      const target = st.cells[c.prey.cell];
      if (!target || !target.inmate || !T.canEat(st, lion, target.inmate)) {
        problems.push(`The prey mark from cell ${L(n)} needs a same-rarity meal for the Lion in cell ${L(c.prey.cell)}.`);
        return;
      }
      if (st.prey.some((l) => [l.lion, l.prey].includes(target.inmate.id) || [l.lion, l.prey].includes(lion.id))) {
        problems.push(`Cell ${L(c.prey.cell)} already has a prey mark.`);
        return;
      }
      st.prey.push({ lion: lion.id, prey: target.inmate.id, preyBeast: target.inmate.beast, rounds: clamp(toInt(c.prey.rounds, 1), 1, 9), next: st.day + 1 });
    });

    st.vault = m.vault.filter((b) => T.BEASTS.includes(b)).map((beast) => ({ id: st.nextId++, beast, day: 1 }));
    st.cache = st.vault.length;
    st.tools = T.TOOL_IDS.filter((id) => m.tools.includes(id));
    st.position = clamp(toInt(m.warden, 0), 0, T.CELL_COUNT - 1);
    st.chain = !!m.chainArmed;
    const need = (T.OBJECTIVES[m.objective] && T.OBJECTIVES[m.objective].need) || 0;
    st.objective = { id: m.objective, progress: need ? clamp(toInt(m.walkTiles, 0), 0, need) : 0 };
    st.startEvent = m.startEvent !== 'none' ? m.startEvent : null;
    st.milestone = !!m.milestone || (need > 0 && st.objective.progress >= need);
    st.stats.best = Math.max(0, ...st.cells.filter((c) => c.inmate).map((c) => c.inmate.tier), st.vault.length ? T.RAINBOW : 0);
    st.used = { swap: 0, devour: 0 };
    st.destinations = [];
    st.event = null;
    st.pending = [];
    st.phase = 'manage';

    const usedToday = () => {
      st.used = { swap: m.swapUsed ? 1 : 0, devour: m.devourUsed ? 1 : 0, devourAfterSwap: !!m.consumeOffered, noSwap: !!m.noSwap, noDevour: !!m.noDevour, noHunt: !!m.noHunt, huntOnly: Array.isArray(m.huntOnly) ? m.huntOnly.slice() : null, officeOnly: m.officeOnly || null };
    };
    switch (m.step) {
      case 'patrol': {
        st.phase = 'patrol';
        st.destinations = [...new Set(m.dest)]
          .filter((n) => Number.isInteger(n) && n >= 0 && n < T.CELL_COUNT && n !== st.position)
          .sort((a, b) => T.stepsBetween(st.position, a) - T.stepsBetween(st.position, b));
        if (!st.destinations.length) problems.push("Mark today's doors: tick them under “Which door to patrol”, or select a cell and press Today's door.");
        // Doors are always among the cells just ahead of the warden, clockwise.
        // One outside them means the warden (or the door) is in the wrong
        // cell, and the advice would send the warden most of the way round.
        const range = st.params.patrolRange;
        const reach = (w, n) => T.stepsBetween(w, n) >= 1 && T.stepsBetween(w, n) <= range;
        const doors = [...new Set(m.dest)].filter((n) => Number.isInteger(n) && n >= 0 && n < T.CELL_COUNT);
        const outside = doors.filter((n) => !reach(st.position, n));
        // The game's tutorial run scripts its doors: the warden in 05 with
        // doors 06, 08 and 14, seen on dozens of players' boards (report 34).
        // No other run has shown a door past the six cells ahead.
        const tutorial = st.position === 4 && doors.length === 3 && [5, 7, 13].every((n) => doors.includes(n));
        if (outside.length && !tutorial) {
          const fits = [];
          for (let w = 0; w < T.CELL_COUNT; w++) if (doors.every((n) => reach(w, n))) fits.push(L(w));
          const where = fits.length > 1 ? `${fits.slice(0, -1).join(', ')} or ${fits[fits.length - 1]}` : fits[0];
          problems.push(`Doors are always among the ${range} cells clockwise ahead of the warden, and ${outside.length === 1 ? `cell ${L(outside[0])} isn't` : `cells ${outside.map(L).join(' and ')} aren't`}: the warden is set in cell ${L(st.position)}. ${fits.length ? `Check the warden's cell: with these doors it's in cell ${where}.` : "No single cell has all these doors in reach, so check the doors too."}`);
        }
        break;
      }
      case 'ratway': {
        // The Sewer Ratway's "Select an Objective": any cell but the office,
        // after the day's patrol.
        st.phase = 'patrol';
        st.ratway = true;
        st.destinations = st.cells.filter((c) => c.n !== T.OFFICE).map((c) => c.n);
        break;
      }
      case 'event': {
        const here = st.cells[st.position];
        if (!here || here.sealed || !here.inmate) problems.push("An event needs the inmate that came out of the door in the warden's cell: put the warden there and set its inmate.");
        st.phase = 'event';
        st.event = { kind: T.EVENTS[m.eventKind] ? m.eventKind : 'chain', cell: st.position };
        break;
      }
      case 'choice': {
        usedToday();
        const kind = m.choice.kind === 'gift' ? 'gift' : 'tool';
        const options = kind === 'gift' ? T.GIFT_IDS.slice() : [...new Set(m.choice.options)].filter((id) => T.TOOLS[id] && !st.tools.includes(id));
        if (!options.length) problems.push('Pick the tools on offer.');
        st.pending = [{ kind, options, rerolls: kind === 'tool' ? m.choice.rerolls || 0 : 0 }];
        // The Treasure's picks still waiting after this one (Opulence).
        if (kind === 'gift') for (let k = 1; k < clamp(toInt(m.choice.picks, 1), 1, 30); k++) st.pending.push({ kind, options: options.slice(), rerolls: 0 });
        break;
      }
      case 'chain': {
        // The warden's inmate has eaten and has a meal again: the game asks
        // which to eat, even with only one, and its Cancel stops the chain.
        usedToday();
        st.used.devour = 1;
        const here = st.cells[st.position];
        if (!here || here.sealed || !here.inmate) {
          problems.push("A chain needs its eater in the warden's cell: put the warden there and set the inmate as it is now.");
          break;
        }
        st.chaining = { eater: here.inmate.id, at: 0, bites: [] };
        if (!T.chainOptions(st).length) {
          problems.push("Your game asks for a meal only when the chaining inmate has one to eat. Check the board: it can't find a meal for it.");
        }
        break;
      }
      case 'office': {
        // Only when the game shows the Instigate and Bestow buttons. Standing
        // in the office isn't enough: the run starts there without them, and
        // they're gone once one is taken.
        usedToday();
        if (st.position !== T.OFFICE) problems.push('Instigate and Bestow come with the warden in the office: put the warden in cell 01.');
        st.phase = 'office';
        break;
      }
      default:
        usedToday();
    }
    return { st, problems };
  }

  function keptTusk(base, n, beast, tier) {
    const was = base && base.cells && base.cells[n];
    return !!(was && was.kind === 'inmate' && was.ivory && was.beast === beast && tier >= was.tier);
  }

  function chainToModel(r, base) {
    const m = JSON.parse(JSON.stringify(base));
    const checks = new Set();
    const notes = [];
    const warden = r.warden ? r.warden.cell : base.warden;
    // The turn before: the same warden after the patrol, or the patrol that
    // brought the warden here.
    const after = base.warden === warden && (base.step === 'manage' || base.step === 'chain');
    const walked = base.step === 'patrol' && (base.dest || []).includes(warden);
    if (!after && !walked) {
      // Nothing to build on: the board as read, its darkened rarities marked.
      r.cells.forEach((c, n) => {
        if (n === T.OFFICE || n === warden) return;
        if (c.kind === 'locked') m.cells[n] = { kind: 'sealed', event: null };
        else if (c.kind === 'inmate') m.cells[n] = { kind: 'inmate', beast: c.beast, tier: clamp(c.tier, 0, TOP_TIER), ivory: keptTusk(base, n, c.beast, clamp(c.tier, 0, TOP_TIER)), prey: null };
        else m.cells[n] = { kind: 'empty' };
        if (c.kind !== 'locked') checks.add(n);
      });
      notes.push('A consume’s meal pick darkens the board, so its rarities were guessed: check the marked cells, or load the board from before the consume first.');
    }
    m.warden = warden;
    const was = base.cells[warden];
    const eater = r.cells[warden];
    // Cells the chain has eaten show a padlock again. The meal pick darkens
    // padlocks enough to read as an empty cell (reports 314 and 322), which
    // the live board never has, so a cell that held an inmate and now reads
    // empty was eaten too. Missing it took the chain for the day's first
    // consume, and the advice said Replace.
    let eaten = 0;
    if (after || walked) {
      r.cells.forEach((c, n) => {
        if (n === T.OFFICE || n === warden || (c.kind !== 'locked' && c.kind !== 'empty') || m.cells[n].kind !== 'inmate') return;
        m.cells[n] = { kind: 'sealed', event: null };
        eaten += 1;
      });
    }
    // Nothing eaten yet and the same beast in the warden's cell: the day's
    // first meal pick, where the eater can't have changed. The meal screen's
    // red light makes the reader's rarities unreliable there (report 337: an
    // eater read as Supreme, and the advice turned from its consume to End),
    // so the board before's eater and meals stand. A chain's eater rose and
    // re-rolled its beast, so there the reading stands.
    const sameBeast = !!was && was.kind === 'inmate' && !!eater && eater.kind === 'inmate' && was.beast === eater.beast;
    const first = eaten === 0 && (walked || sameBeast);
    if (first && was && was.kind === 'inmate') m.cells[warden] = JSON.parse(JSON.stringify(was));
    else if (eater && eater.kind === 'inmate') m.cells[warden] = { kind: 'inmate', beast: eater.beast, tier: clamp(eater.tier, 0, TOP_TIER), ivory: !!(was && was.ivory), prey: was && was.kind === 'inmate' ? was.prey : null };
    else {
      checks.add(warden);
      notes.push('The eater in the warden’s cell wasn’t read: set it as it is now.');
    }
    const tier = m.cells[warden].kind === 'inmate' ? m.cells[warden].tier : 0;
    // The meals on offer: the board before keeps its inmate when it fits;
    // otherwise the beast read here, at the eater's rarity. A scratched door
    // stays a door.
    for (const n of r.chain.targets) {
      const c = m.cells[n];
      if (c.kind === 'scratch') continue;
      if (c.kind === 'inmate' && c.tier <= tier && (!r.cells[n].beast || c.beast === r.cells[n].beast)) continue;
      m.cells[n] = { kind: 'inmate', beast: r.cells[n].beast || (c.kind === 'inmate' ? c.beast : 'mammoth'), tier, ivory: c.kind === 'inmate' ? !!c.ivory : false, prey: null };
      checks.add(n);
    }
    m.step = first ? 'manage' : 'chain';
    m.devourUsed = m.step === 'chain';
    // The meal pick shows the meals and Cancel, never Replace. A chain taken
    // for the day's first consume (report 323: the board before didn't hold
    // the meal already eaten) has no Replace after Cancel either, so the
    // advice weighs the meals against not consuming. No Hunt either (report
    // 128: after a Cancel, the Prey mark advised couldn't be made).
    if (m.step === 'manage') {
      m.swapUsed = false;
      m.noSwap = true;
      m.noHunt = true;
    }
    m.dest = [];
    m.chainArmed = false;
    const tools = (m.tools || []).map((id) => ({ id, sim: id, name: T.toolName(id), conf: 1 }));
    return { model: m, checks, notes, chromatic: (m.vault || []).length, tools, unsim: [], chain: r.chain.targets };
  }

  function runTools(read, base, m, notes, sims) {
    const sameRun = !(m.day < base.day);
    const known = sameRun ? (base.tools || []).filter((id) => T.TOOLS[id]) : [];
    const offer = sameRun && base.step === 'choice' && base.choice && base.choice.kind === 'tool' ? base.choice.options.filter((id) => T.TOOLS[id]) : [];
    const out = known.map((id) => ({ id, sim: id, name: T.toolName(id), conf: 1, kept: true }));
    const has = (id) => out.some((t) => t.sim === id);
    const slots = read.length;
    // A set run: once the run's instruments are known (the offers the
    // analyzer saw and advised, or the player's confirmation), they're
    // presumed and locked (m.toolsLocked), and icons never change them. The
    // user: "once the instruments have been recommended and selected, it
    // should presume those are the instruments and not say anything unless
    // it sees more total instruments than it already had". So the only
    // question is a panel showing more than the run has and than the count
    // last confirmed (m.toolsSeen).
    m.toolsToConfirm = '';
    m.toolsPanel = slots;
    if (!sameRun) {
      m.toolsLocked = false;
      m.toolsSeen = 0;
    }
    if (sameRun && (known.length || offer.length || base.runStart || base.toolsLocked)) {
      if (offer.length && slots > known.length && !offer.some(has)) {
        const seen = read.filter((t) => offer.includes(t.sim)).sort((a, b) => b.conf - a.conf)[0];
        // An icon read as an instrument that wasn't offered can still be one
        // that was: the closest offered one among its runner-ups (report 75:
        // the Forged Key read as the Lost Ring of Keys).
        let alike = null;
        if (!seen) {
          for (const t of read) {
            if (has(t.sim)) continue;
            const a = (t.alts || []).find((x) => x.sim && offer.includes(x.sim) && x.score >= 0.7);
            if (a && (!alike || a.score > alike.score)) alike = { sim: a.sim, score: a.score, as: t.sim };
          }
        }
        // The advice given on that offer: the board before is the offer, so
        // the analyzer's current recommendation is for it.
        const rec = base === model && fresh() ? recommendation() : null;
        const advised = rec && rec.action && rec.action.type === 'choose' && offer.includes(rec.action.id) ? rec.action.id : null;
        const take = seen ? seen.sim : alike ? alike.sim : advised;
        if (take) {
          out.push({ id: take, sim: take, name: T.toolName(take), conf: 1, kept: true });
          if (!seen && alike) notes.push(`An icon read as ${alike.as ? T.toolName(alike.as) : 'another instrument'}, which wasn't offered: taken as ${T.toolName(take)}, the closest of the offer. If you took another, change it under Torture Instrument.`);
          else if (!seen) notes.push(`Took it you chose ${T.toolName(take)}, as advised. If you took another, change it under Torture Instrument.`);
        } else notes.push(`Your instruments show one more than before, from the offer of ${offer.map((id) => T.toolName(id)).join(', ')}: set which you took under Torture Instrument.`);
      }
      if (out.length) m.toolsLocked = true;
      if (slots > Math.max(out.length, base.toolsSeen || 0)) m.toolsToConfirm = `Your panel shows ${T.plural(slots, 'instrument')}, and the analyzer has ${out.length}: ${out.map((t) => t.name).join(', ') || 'none'}. Set the ones you hold, then press These are right.`;
      return out;
    }
    // Nothing known of the run yet: only icons the reader is sure of, and
    // the player is asked to confirm.
    for (const t of read) if (t.sim && !has(t.sim) && t.conf >= TOOL_SURE) out.push(t);
    if (read.length) m.toolsToConfirm = `The analyzer doesn’t know this run’s instruments yet. It read ${out.length ? out.map((t) => T.toolName(t.sim)).join(', ') : 'none for sure'} from your panel of ${read.length}. Set the ones you hold, then press These are right.`;
    return out;
  }

  function scanToModel(r, base) {
    if (r.chain) return chainToModel(r, base);
    const m = JSON.parse(JSON.stringify(base));
    const checks = new Set();
    const notes = [];
    // Days until the riot set how much of the run is left.
    if (r.days) {
      const left = r.days.days;
      if (left < m.maxDays) m.day = Math.max(1, m.maxDays - left);
      else if (left < 30) {
        // More days left than the run has: only Iron Law's 30-day run has
        // that many.
        m.maxDays = 30;
        m.day = 30 - left;
        notes.push(`The riot is ${T.plural(left, 'day')} away, more than this run had, so it's now a 30-day run (Iron Law). Check the day.`);
      } else {
        // No run is that long: a misread countdown. It mustn't stretch the
        // run for good (one read as 38 made every later day "of 39").
        notes.push(`The days until the riot read as ${left}, more than any run has: check the day.`);
      }
    } else notes.push('The days until the riot weren’t read: check the day.');
    r.cells.forEach((c, n) => {
      if (n === T.OFFICE) return;
      if (c.kind === 'locked') {
        if (c.nest) {
          m.cells[n] = { kind: 'nest', due: m.day + 2 };
          checks.add(n);
        } else {
          // A door whose rarity shows, as read: a "?" portrait, scratched by
          // the Filthy Claws or not (report 243). A scratch stays while the
          // door is locked, even if its slashes weren't read.
          // What the player knew of a door that's still locked stays too: a
          // rarity shown (Crow Whispers, or the "Treasure" Hunt's "?"
          // portrait) and the Hunt's Rare or better.
          const was = base.cells[n];
          const event = c.event ? 'unknown' : null;
          if (c.shown) {
            m.cells[n] = { kind: c.shown.scratch || (was && was.kind === 'scratch') ? 'scratch' : 'revealed', tier: clamp(c.shown.tier, 0, TOP_TIER), event };
            if (c.shown.conf < 0.6) checks.add(n);
          } else if (was && (was.kind === 'revealed' || was.kind === 'scratch')) m.cells[n] = { kind: was.kind, tier: was.tier, event };
          else if (was && was.kind === 'sealed' && was.atLeast) m.cells[n] = { kind: 'sealed', event, atLeast: was.atLeast };
          else m.cells[n] = { kind: 'sealed', event };
        }
        if (c.conf < 0.6) checks.add(n);
      } else if (c.kind === 'inmate') {
        // The gold crosshair under a portrait: someone's Prey mark (report 352).
        m.cells[n] = { kind: 'inmate', beast: c.beast, tier: clamp(c.tier, 0, TOP_TIER), ivory: keptTusk(base, n, c.beast, clamp(c.tier, 0, TOP_TIER)), prey: null, marked: !!c.prey, event: c.event ? 'unknown' : null };
        if (c.conf < 0.6 || c.ghost) checks.add(n);
      } else {
        m.cells[n] = { kind: 'empty' };
        checks.add(n);
      }
    });
    // Most cells read as open and empty, which a board rarely is: it was
    // likely placed wrong (a screen shape the reader handled badly, report
    // 144), so the reading is checked before it's trusted.
    const emptyRead = r.cells.filter((c) => c.n !== T.OFFICE && c.kind !== 'locked' && c.kind !== 'inmate').length;
    if (emptyRead >= 8) notes.push(`${emptyRead} cells read as open and empty, which is unusual: the board may be misread. Check it against your game.`);
    if (r.warden) {
      m.warden = r.warden.cell;
      if (r.warden.conf < 0.6) checks.add(r.warden.cell);
    } else notes.push('The warden’s arrow wasn’t found: set the warden.');
    if (r.doors && r.doors.cells.length) {
      m.step = 'patrol';
      m.dest = r.doors.cells.filter((n) => n !== m.warden);
      // The mouse pointer over a card's number hides its digit (report 318),
      // unless the lit cells settled it (report 360). Unsettled, that door is
      // marked Check: a guess, not a reading.
      if (r.doors.hidden && r.doors.hidden.length && r.doors.lit) notes.push(`The mouse pointer covers the number on one card: the lit cells show it is cell ${L(r.doors.hidden[0])}.`);
      else if (r.doors.hidden && r.doors.hidden.length) {
        notes.push(`The mouse pointer covers the number on the card read as ${r.doors.hidden.map((n) => `cell ${L(n)}`).join(' and ')}: check that door.`);
        r.doors.hidden.forEach((n) => checks.add(n));
      }
      else if (r.doors.conf < 0.6) notes.push('Today’s doors were hard to read: check them.');
    } else if (!r.decision && !r.statusView && base.step === 'patrol' && (base.dest || []).length && m.day === base.day && m.warden === base.warden) {
      // No door cards and no buttons, on the same day with the warden where
      // it was: the cards haven't come back yet (report 334: pictured just
      // after a Warden's Treasure closed), so the doors stay as they were.
      m.step = 'patrol';
      m.dest = base.dest.slice();
      notes.push('No door cards or buttons showed (they may not have come back yet): today’s doors are kept from the board before.');
    } else {
      m.step = 'manage';
      m.dest = [];
      m.devourUsed = false;
      m.swapUsed = false;
    }
    m.chainArmed = false;
    // The cards under “Make Your Decision” are what the game allows now: a
    // swap only with a Replace card, a consume only with a Consume card. A
    // Consume card with no Replace card is a consume on offer, even after
    // today's swap.
    m.consumeOffered = false;
    m.treasureWait = false;
    m.treasureSeen = false;
    m.noSwap = false;
    m.noDevour = false;
    m.noHunt = false;
    m.huntOnly = null;
    m.officeOnly = null;
    // Without the cards (a picture taken as they come up), a board of the
    // same day with the warden in the same cell keeps what the board
    // before knew. And if the warden's inmate has changed since, today's
    // swap is done: it isn't advised again, while a consume still can be.
    const sameVisit = m.day === base.day && m.warden === base.warden && ['manage', 'choice', 'event'].includes(base.step);
    if (!r.decision && sameVisit && m.step === 'manage') {
      m.swapUsed = !!base.swapUsed;
      m.devourUsed = !!base.devourUsed;
      m.noSwap = !!base.noSwap;
      m.noDevour = !!base.noDevour;
      m.noHunt = !!base.noHunt;
      m.consumeOffered = !!base.consumeOffered;
      const was = base.cells[m.warden];
      const now = m.cells[m.warden];
      if (!m.devourUsed && was && now && was.kind === 'inmate' && now.kind === 'inmate' && (was.beast !== now.beast || was.tier !== now.tier)) {
        m.swapUsed = true;
        m.consumeOffered = true;
        notes.push('The warden’s inmate changed since the board before, so today’s Replace is taken as done.');
        m.cells[m.warden].ivory = false; // a Tusk mark is used by the Replace
      }
    }
    // “Select an Objective” with the warden on a Lion and the Blood-Stained
    // Trap held: the Hunt's pick of its prey when only some cells are framed
    // (report 352: the Lion's 3 meals), not the Sewer Ratway's, which frames
    // all 15. Without the frames read, it's the Hunt's when it comes right
    // after this visit's cards (the Ratway's follows its event card).
    const here = m.cells[m.warden];
    const trap = (m.tools || []).includes('trap') || ((r.tools && r.tools.tools) || []).some((t) => t.sim === 'trap');
    const framed = r.decision && r.decision.ratway && Array.isArray(r.decision.framed) && r.decision.framed.length ? r.decision.framed : null;
    const lionHere = !!here && here.kind === 'inmate' && here.beast === 'lion';
    const huntPick = !!(r.decision && r.decision.ratway) && trap && lionHere && (framed ? framed.length < 14 : base.step === 'manage' && m.day === base.day && m.warden === base.warden);
    if (r.decision && r.decision.office) {
      // The office's Instigate and Bestow cards. The game can show just one
      // (report 383: Bestow alone), when the reader tells them apart.
      m.step = 'office';
      m.dest = [];
      const ins = r.decision.instigate;
      const bes = r.decision.bestow;
      if (ins === false && bes) m.officeOnly = 'bestow';
      else if (bes === false && ins) m.officeOnly = 'instigate';
    } else if (huntPick) {
      // Only the Hunt is open now, on the framed cells.
      m.step = 'manage';
      m.dest = [];
      m.swapUsed = false;
      m.devourUsed = false;
      m.noSwap = true;
      m.noDevour = true;
      if (framed) m.huntOnly = framed.slice();
    } else if (r.decision && r.decision.ratway) {
      // The Sewer Ratway's cell pick: a move to any cell but the office.
      m.step = 'ratway';
      m.dest = [];
    } else if (r.decision) {
      // A missing card means that move isn't on offer now, not that it was
      // used: a used consume would rule out today's swap too.
      m.swapUsed = false;
      m.devourUsed = false;
      m.noSwap = !r.decision.replace;
      m.noDevour = !r.decision.consume;
      // A Hunt marks an inmate the Lion could consume, so it's offered only
      // beside a Consume card (reports 353-355: a Hunt advised with only End
      // showing). A reader that tells the Hunt card says so itself. And one
      // gone stays gone for the visit (report 128: none after a meal pick's
      // Cancel).
      m.noHunt = ('hunt' in r.decision ? !r.decision.hunt : !r.decision.consume) || (sameVisit && !!base.noHunt);
      // A Consume card after today's swap is a consume on offer.
      m.consumeOffered = !!r.decision.consume;
    }
    const read = r.tools && r.tools.tools ? r.tools.tools : [];
    const unsim = read.filter((t) => !t.sim);
    if (unsim.length) notes.push(`Not in the simulator yet, so left out: ${unsim.map((t) => t.name).join(', ')}.`);
    const tools = runTools(read, base, m, notes, r.tools && r.tools.sims);
    m.tools = tools.map((t) => t.sim);
    // A door short two mornings of the run, with none of the instruments
    // that take one known: the Forged Key, Barbed Whip or Burning Stake.
    // The reader can't tell the Forged Key on a panel, and runs that read as
    // holding the Ring of Keys or the Dog Tag see two doors every morning
    // (f5, from the collected boards). Mornings with the office within
    // reach don't count: its card can be missed.
    const takers = ['forged', 'whip', 'stake'];
    if (m.day < base.day) m.shortDays = [];
    const officeNear = [1, 2, 3, 4, 5, 6].some((k) => (m.warden + k) % T.CELL_COUNT === T.OFFICE);
    const doorsDue = T.DEFAULT_PARAMS.destinations - m.tools.filter((id) => takers.includes(id)).length;
    if (m.step === 'patrol' && !officeNear && m.dest.length && m.dest.length < doorsDue) m.shortDays = [...new Set([...(m.shortDays || []), m.day])];
    if ((m.shortDays || []).length >= 2 && !m.tools.some((id) => takers.includes(id))) {
      // Held as the Lost Ring of Keys, which takes no door: the Forged Key's
      // icon, two keys on a ring (report 378), passes for it on the panel.
      const hint = m.tools.includes('keys')
        ? `${T.plural(m.shortDays.length, 'morning')} of this run offered a door short, which the Lost Ring of Keys doesn't do. The Forged Key does, and its icon looks like the Ring's: if you hold the Forged Key, set it under Torture Instrument in place of the Lost Ring of Keys${m.toolsLocked ? '' : ', then press These are right'}.`
        : `${T.plural(m.shortDays.length, 'morning')} of this run offered a door short, as the Forged Key, Barbed Whip or Burning Stake do. If you hold one, set it under Torture Instrument${m.toolsLocked ? '' : ', then press These are right'}.`;
      if (m.toolsLocked || m.toolsToConfirm) notes.push(hint);
      else m.toolsToConfirm = hint;
    }
    if (tools.some((t) => t.conf < TOOL_SURE)) notes.push('Some instruments were hard to tell apart: check them under Torture Instrument.');
    const chromatic = r.chromatic ? r.chromatic.count : 0;
    // Their beasts don't show in the slots, and nothing depends on them.
    m.vault = new Array(chromatic).fill('wolf');
    const highest = Math.max(0, ...m.cells.filter((c) => c.kind === 'inmate').map((c) => c.tier));
    // The start card's badge under the instrument panel: the run has that
    // card, in case its popup was missed. Only while no card is set: one the
    // player or a popup set stands (report 358: a Cage Fight badge read as
    // Tyranny undid the player's choice on every picture).
    if (r.badge && r.badge.id && T.START_EVENTS && T.START_EVENTS[r.badge.id] && (!m.startEvent || m.startEvent === 'none')) {
      m.startEvent = r.badge.id;
      notes.push(`Start of run: ${T.START_EVENTS[r.badge.id].name}, from its badge under the instruments.`);
    }
    // A badge that looks like more than one card (Tyranny and Cage Fight):
    // not guessed; the player sets it.
    if (r.badge && r.badge.alike && T.START_EVENTS && (!m.startEvent || m.startEvent === 'none')) {
      const names = r.badge.alike.filter((id) => T.START_EVENTS[id]).map((id) => T.START_EVENTS[id].name);
      if (names.length) notes.push(`The run's start card looks like ${names.join(' or ')} from its badge, which look alike: set it under Start of run.`);
    }
    // King of the Caged is met once a Supreme or Chromatic shows. Prison
    // Walk's tiles aren't read, so they keep what was set.
    if (m.objective === 'king') m.milestone = highest >= T.SUPREME || chromatic > 0;
    // The jaws marker shows on every inmate with something to eat. Cells that
    // disagree were probably misread. A washed-out portrait takes the beast
    // that makes the jaws fit.
    const hasTarget = (state, n) => !state.cells[n].sealed && state.cells[n].inmate && T.devourOptions(state, n).length > 0;
    r.cells.forEach((c, n) => {
      if (!c.ghost || m.cells[n].kind !== 'inmate') return;
      let best = null;
      for (const beast of T.BEASTS) {
        const trial = JSON.parse(JSON.stringify(m));
        trial.cells[n].beast = beast;
        const s2 = buildState(Object.assign({}, trial, { step: 'manage' })).st;
        const fit = r.cells.filter((d, k) => d.kind === 'inmate' && d.jaws !== null && hasTarget(s2, k) === !!d.jaws).length;
        if (!best || fit > best.fit) best = { beast, fit };
      }
      m.cells[n].beast = best.beast;
    });
    const { st: final } = buildState(Object.assign({}, m, { step: 'manage' }));
    const oddCells = [];
    r.cells.forEach((c, n) => {
      if (c.kind !== 'inmate' || m.cells[n].kind !== 'inmate') return;
      // Jaws over a Supreme's red glow aren't known (null): no check.
      if (c.jaws !== null && hasTarget(final, n) !== !!c.jaws) {
        checks.add(n);
        oddCells.push(n);
      }
    });
    // The game shows Consume only when the warden's inmate has a meal. With
    // none on the board as read, the advice can't weigh Consume: say why,
    // and where to look.
    const w = m.warden;
    const noMeal = !!(r.decision && r.decision.consume) && w != null && m.cells[w] && m.cells[w].kind === 'inmate' && !hasTarget(final, w);
    if (noMeal) {
      checks.add(w);
      notes.push(`Your game offers Consume, but the board as read has no meal for the ${T.describe(m.cells[w])} in ${L(w)}, so the advice can’t weigh Consume: check it and the inmates it could eat.`);
    }
    const odd = oddCells.filter((n) => !(noMeal && n === w)).length;
    if (odd) notes.push(odd === 1 ? '1 inmate’s jaws marker doesn’t fit what was read: check it and the inmates around.' : `${odd} inmates’ jaws markers don’t fit what was read: check them and the inmates around.`);
    // Cage Fight set for this run while the game's jaws fit better without
    // it (report 311: a Legendary Wolf showed no jaws over a Rare Rat that
    // Cage Fight would let it eat, and the advice had a Legendary Lion eat
    // that Rat). No reader sets the card, so it was likely set by hand.
    if (m.startEvent === 'cagefight' && oddCells.length) {
      const plain = buildState(Object.assign({}, m, { step: 'manage', startEvent: 'none' })).st;
      const known = r.cells.map((c, n) => n).filter((n) => r.cells[n].kind === 'inmate' && m.cells[n].kind === 'inmate' && r.cells[n].jaws !== null);
      const fits = (state) => known.filter((n) => hasTarget(state, n) === !!r.cells[n].jaws).length;
      const against = known.filter((n) => !r.cells[n].jaws && hasTarget(final, n) && !hasTarget(plain, n));
      if (against.length && fits(plain) > fits(final)) {
        const n = against[0];
        const meal = T.devourOptions(final, n)[0].cell;
        notes.push(`Cage Fight is set for this run, but your game shows no jaws on the ${T.describe(m.cells[n])} in ${L(n)}, which Cage Fight would let eat the ${T.describe(m.cells[meal])} in ${L(meal)}. If this run doesn’t have Cage Fight, set Start of run to No card.`);
      }
    }
    return { model: m, checks, notes, chromatic, tools, unsim, huntPick };
  }
module.exports = { blankModel, normalize, buildState, scanToModel };
