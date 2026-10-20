// Generated verbatim CoffeeBns follower/triggers + desktop bridge hooks.
'use strict';
module.exports = function createAutoCore({emit, setState, grab}) {
let rules = [], watch = null, burst = null, pace = 1;
const state = {hits:0,frames:0};
const sendRules = () => {};
const isBlank = () => false;
const whyNot = () => '截圖或辨識未完成';
const stampOf = line => { const m = /^\[([^\]]+)\]/.exec(line); return m ? m[1] : ''; };
  const RANK = { board: 1, instruments: 2, brushstroke: 2, objective: 3, treasure: 3, open: 3, startover: 4, chest: 5, finish: 6, manual: 7 };
  // #region default-triggers
  // The prison is "S16" in the game's log. A run starts with a pick of 3
  // instruments, which the game logs as it opens. Then each day starts with
  // a "new day" banner; when it closes, the game writes the day's number
  // (out of 20) and lights the cells you can go to. A picture 1.5 seconds
  // after either shows the screen settled, while you choose. The results
  // screen at the end writes the day line too, with max=0, and is left out.
  const DEFAULT_RULES = [
    '# kind | pattern | settle ms  (one trigger a line; # starts a note)',
    '# Tartarus Prison is S16 in the log. A run\'s objective, when it shows one:',
    'objective | S16BoardTaskPop Run | 1500',
    '# The pick of 3 instruments, and after a re-roll:',
    'instruments | S16BoardRelicPop Run | 1500',
    'instruments | Btn_S16Board_RelicPop_Reroll | 2000',
    '# Each day, once its banner closes, and after a move, once its cards come up:',
    'board | \\[S16LastDay\\] check cur=\\d+ max=[1-9] | 1500',
    'board | UI_S16_Card_Up | 1500',
    '# After an action in the cell, and after each bite of a consume chain',
    '# (the next meal to pick, or the board after the chain), once it plays',
    "# out; unless the day ends, as a new day's banner drops a picture still",
    '# waiting (skip):',
    'board | Btn_S16Board_ActionCell | 2000',
    'board | UI_S16_Click_Eat | 2500',
    'skip | S16BoardNewDayPop Run | 0',
    "# The Warden's Treasure, which a Chromatic prisoner opens, and the board",
    '# once it closes, with the gift taken (a consume can open two in a row):',
    'treasure | S16BoardColoredPop Run | 1500',
    'board | S16BoardColoredPop Destory | 600',
    "# The game's Speed-up button: no picture, it flips 'Speed-up is on' here:",
    'speed | Btn_S16Board_Top_Speed | 0',
    '# A Cancel (a consume chain stopped), once the board settles:',
    'board | UI_S16_Click_Cancel | 1500',
    "# After an event's Confirm (the Sewer Ratway's cell pick, or the board after it):",
    'board | Btn_S16Board_EventPop_Confirm | 1500',
  ].join('\n');
  // The prison's own events, for working out more triggers: its buttons,
  // sounds and screens, without the lines that repeat them.
  const DEFAULT_WATCH = '^(?!.*(LogDataTable|AssetLoad@|PageStack@|PageBase@|PageView@|CardMotion|CardPose|BGM_))(?=.*S16)';

  function parseRules(text) {
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split('|').map((s) => s.trim());
      const [kind, pattern, settle] = parts.length >= 2 ? parts : ['board', parts[0], ''];
      if (pattern) out.push({ kind: kind || 'board', pattern, settle: Number(settle) || 900, rank: RANK[kind] || 1 });
    }
    return out;
  }
  function follower(post) {
    const MAX_READ = 1024 * 1024; // bytes per look: anything older is skipped
    const MAX_LINE = 8192; // characters of one line that are checked
    const MAX_HITS = 200; // lines reported per look: the newest
    // The game's own lines, which every trigger is: with the game's Enable
    // Log off, it writes almost none (a player's log: 42 in all).
    const DETAIL = /\b(TLLua|TLGame):/;
    // The game's language, which it writes every few minutes ("sdkLang=en_US"):
    // only its two letters are kept, and the line is dropped like any other.
    const LANG = /\bsdkLang=([A-Za-z]{2})[_-]/;
    let handle = null;
    let offset = 0;
    let decoder = null;
    let rest = '';
    let busy = false;
    let gone = false; // the log isn't there (deleted, or between two logs)
    let failed = ''; // the last error reported, so each is reported once
    let triggers = [];
    let watching = null;
    const compile = (list) => list.map((s) => {
      try {
        return new RegExp(s, 'i');
      } catch (e) {
        return null;
      }
    });
    const readFrom = (at) => {
      offset = at;
      decoder = new TextDecoder('utf-8');
      rest = '';
    };
    const fail = (e) => {
      const missing = !!e && e.name === 'NotFoundError';
      const message = missing ? '' : String((e && e.message) || e);
      if (missing && !gone) post({ type: 'gone' });
      else if (!missing && message !== failed) post({ type: 'error', message });
      gone = missing;
      failed = message;
    };
    let begun = false; // whether the log has been found since start
    let fromFirst = false;
    async function tick() {
      if (!handle || busy) return;
      busy = true;
      try {
        const file = await handle.getFile();
        if (!begun) {
          // The first look starts at the end of the log, unless it was
          // missing until now: then the game wrote all of it since.
          begun = true;
          readFrom(fromFirst || gone ? 0 : file.size);
          post({ type: 'started', name: file.name || handle.name || 'UE_game.log', size: file.size });
        } else if (gone || file.size < offset) {
          // The game started a new log, or the deleted one is back.
          readFrom(0);
          post({ type: 'rotated' });
        }
        gone = false;
        failed = '';
        // Over a look's worth is new (a big log in place of the old one, or
        // the PC slept): only the newest part is read.
        if (file.size - offset > MAX_READ) readFrom(file.size - MAX_READ);
        if (file.size > offset) {
          const buf = await file.slice(offset, file.size).arrayBuffer();
          offset = file.size;
          const lines = (rest + decoder.decode(buf, { stream: true })).split(/\r?\n/);
          rest = lines.pop().slice(-MAX_LINE);
          const hits = [];
          let detail = 0;
          let lang = '';
          for (const whole of lines) {
            // A line can only be this long if the log was cleared while the
            // game wrote on: its text is at the end.
            const line = whole.length > MAX_LINE ? whole.slice(-MAX_LINE) : whole;
            if (DETAIL.test(line)) detail += 1;
            const said = LANG.exec(line);
            if (said) lang = said[1].toLowerCase();
            const rule = triggers.findIndex((re) => re && re.test(line));
            if (rule >= 0) hits.push({ rule, line: line.slice(0, 400) });
            else if (watching && watching.test(line)) hits.push({ rule: -1, line: line.slice(0, 400) });
          }
          post({ type: 'lines', count: lines.length, detail, lang, hits: hits.slice(-MAX_HITS) });
        }
      } catch (e) {
        fail(e);
      }
      busy = false;
    }
    return {
      start(h, fromStart) {
        handle = h;
        begun = false;
        fromFirst = !!fromStart;
        return tick();
      },
      stop() {
        handle = null;
      },
      rules(list, watchSource) {
        triggers = compile(list);
        watching = watchSource ? compile([watchSource])[0] : null;
      },
      tick,
    };
  }
  function onLine(h) {
    const at = stampOf(h.line);
    if (h.rule < 0) {
      emit('seen', { at, line: h.line });
      return;
    }
    const rule = rules[h.rule];
    if (!rule) return;
    const m = rule.re.exec(h.line);
    const hit = { kind: rule.kind, at, text: m ? (m[1] || m[0]).slice(0, 120) : '', line: h.line };
    setState({ hits: state.hits + 1 });
    emit('hit', hit);
    emit('seen', { at, line: h.line, kind: rule.kind });
    // A "skip" line (a new day's banner) drops a picture still waiting to be
    // taken, as the screen is changing: the next screen's own line follows.
    if (rule.kind === 'skip') {
      if (burst) clearTimeout(burst.timer);
      burst = null;
      return;
    }
    // A "speed" line (the game's Speed-up button) takes no picture: the page
    // hears it as a hit, and sets the pace.
    if (rule.kind === 'speed') return;
    // The board after the Warden's Treasure's popup closes (View Prison
    // Status pressed quickly, or a gift taken) gets its own picture: the
    // Treasure still waiting goes at once, as it needs none (d8: a press
    // within 1.5 s of the popup merged into it, and the board was never
    // pictured).
    if (burst && burst.kind === 'treasure' && rule.kind === 'board') {
      clearTimeout(burst.timer);
      fire();
    }
    // Lines in a burst become one frame, once the log has been quiet for the
    // longest settle time among them.
    if (!burst) burst = { kind: rule.kind, rank: rule.rank, settle: 0, hits: [], timer: 0 };
    if (rule.rank > burst.rank) {
      burst.kind = rule.kind;
      burst.rank = rule.rank;
    }
    burst.settle = Math.max(burst.settle, Math.max(250, rule.settle * pace));
    if (burst.hits.length < 40) burst.hits.push({ kind: hit.kind, at: hit.at, text: hit.text });
    clearTimeout(burst.timer);
    burst.timer = setTimeout(fire, burst.settle);
  }
  async function fire() {
    const b = burst;
    burst = null;
    if (!b) return;
    const frame = await grab(b.kind,b.hits); // Desktop bridge: preserve event kind and fresh-run evidence.
    if (frame) setState({ frames: state.frames + 1 });
    emit('frame', { kind: b.kind, hits: b.hits, frame, blank: isBlank(frame), why: frame ? '' : whyNot(), time: new Date() });
  }
  function setRules(list) {
    rules = [];
    for (const r of list || []) {
      try {
        rules.push({ kind: r.kind || 'board', re: new RegExp(r.pattern, 'i'), settle: Math.max(100, Number(r.settle) || 900), rank: Number(r.rank) || 0 });
      } catch (e) {
        // A bad pattern is left out.
      }
    }
    sendRules();
    return rules.length;
  }
  function setPace(factor) {
    pace = Math.min(1, Math.max(0.2, Number(factor) || 1));
    return pace;
  }
  function setWatch(pattern) {
    try {
      watch = pattern ? new RegExp(pattern, 'i') : null;
    } catch (e) {
      watch = null;
    }
    sendRules();
    return !!watch || !pattern;
  }
setRules(parseRules(DEFAULT_RULES)); setWatch(DEFAULT_WATCH);
return { follower, onLine, setPace, setRules, rules: () => rules, watch: () => watch, stop: () => { if(burst) clearTimeout(burst.timer); burst=null; } };
};
