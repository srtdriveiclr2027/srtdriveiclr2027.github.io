/* Hero animation: the frozen planner's plan is kept as the reference, alternatives are small
   deformations of it (progress along the path, offsets across it), and the selector keeps or
   replaces it. Illustrative only: the geometry below is hand-set and is not model output. */
(() => {
  const scene = document.querySelector('[data-hero-scene]');
  if (!scene) return;

  const svg = scene.querySelector('svg');
  const layer = scene.querySelector('[data-scene-layer]');
  const statusEl = scene.querySelector('[data-hero-status]');
  const noteEl = scene.querySelector('[data-hero-note]');
  const toggle = scene.querySelector('[data-hero-toggle]');
  const toggleLabel = toggle?.querySelector('[data-hero-toggle-label]');
  const steps = [...document.querySelectorAll('[data-hero-step]')];
  const stepBars = steps.map(step => step.querySelector('.hero-step-track > span'));
  const NS = 'http://www.w3.org/2000/svg';

  /* 16 px per metre. The ego starts at x = 100 in the centre of its lane and plans 3 s ahead
     at 8 m/s (24 m), with a waypoint every 0.5 s. Footprints are 4.08 m x 1.85 m. */
  const LOOP = 9000;
  const X0 = 100;
  const Y0 = 124;
  const LEN = 384;
  const WAYPOINTS = 6;
  const HALF_L = 32.5;
  const HALF_W = 15;
  const VIEW_WIDTH = 560;
  const BASE = '#9cb2d9';
  const REJECTED = '#c3cad6';
  const DEEP = '#182c49';

  /* a: offset across the path at the end of the horizon, in px (negative = ego's left).
     g: progress scale along the path (below 1 = slower). */
  const PARKED = [300, 390, 480, 570].map(x => ({ x, y: 176 }));
  const SCENES = [
    {
      label: 'Drift toward parked cars.',
      obstacle: 'parked cars',
      drift: 34,
      agents: PARKED,
      alts: [{ a: 8, g: 1.02 }, { a: 3, g: 0.96 }, { a: -6, g: 1.03 }, { a: -16, g: 0.98 }, { a: -24, g: 1 }, { a: -14, g: 0.9 }, { a: 0, g: 0.9 }]
    },
    {
      label: 'Stopped vehicle ahead.',
      obstacle: 'the stopped vehicle',
      drift: 0,
      agents: [{ x: 520, y: 124 }, { x: 250, y: 176 }, { x: 430, y: 176 }],
      alts: [{ a: -10, g: 1 }, { a: 6, g: 1.02 }, { a: 0, g: 0.95 }, { a: -4, g: 0.84 }, { a: 0, g: 0.9 }, { a: 6, g: 0.86 }, { a: -14, g: 0.97 }]
    },
    {
      label: 'Clear lane.',
      obstacle: '',
      drift: 3,
      agents: PARKED,
      alts: [{ a: 24, g: 1 }, { a: -6, g: 1.02 }, { a: 6, g: 0.97 }, { a: -12, g: 1 }, { a: 0, g: 0.9 }, { a: 10, g: 1.04 }, { a: -16, g: 0.96 }]
    }
  ];
  const MAX_AGENTS = Math.max(...SCENES.map(s => s.agents.length));

  const clamp = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = v => { v = clamp(v); return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2; };
  const smooth = s => { s = clamp(s); return s * s * (3 - 2 * s); };
  const r1 = v => Math.round(v * 10) / 10;
  const r2 = v => Math.round(v * 100) / 100;
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, m) => {
    const A = hex(a), B = hex(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * m)).join(',')})`;
  };

  /* A candidate is the reference path re-timed by g and pushed sideways by a; d in [0, 1]
     morphs it out of the reference, so every alternative starts as the plan itself. */
  const pt = (S, c, d, s) => {
    const u = s * (1 + (c.g - 1) * d);
    return [X0 + LEN * u, Y0 + S.drift * smooth(u) + c.a * d * smooth(s)];
  };
  const heading = (S, c, d, s) => {
    const p1 = pt(S, c, d, Math.max(0, s - 0.02));
    const p2 = pt(S, c, d, Math.min(1, s + 0.02));
    return Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / Math.PI;
  };
  const linePath = (S, c, d, upTo) => {
    if (upTo < 0.01) return '';
    let out = '';
    for (let i = 0; i <= 36; i++) {
      const p = pt(S, c, d, (i / 36) * upTo);
      out += `${i ? ' L' : 'M'}${r1(p[0])} ${r1(p[1])}`;
    }
    return out;
  };
  const dotsPath = (S, c, d, upTo, radius) => {
    const r = r2(radius);
    let out = '';
    for (let k = 1; k <= WAYPOINTS; k++) {
      if (k / WAYPOINTS > upTo + 0.001) break;
      const p = pt(S, c, d, k / WAYPOINTS);
      out += `M${r1(p[0] - r)} ${r1(p[1])} a${r} ${r} 0 1 0 ${r2(2 * r)} 0 a${r} ${r} 0 1 0 ${r2(-2 * r)} 0 `;
    }
    return out;
  };
  const place = (x, y, angle) => `translate(${r1(x)} ${r1(y)}) rotate(${r1(angle)})`;

  /* Collision is checked at each waypoint: does the ego footprint overlap another vehicle? */
  const PLANS = SCENES.map(S => {
    const ref = { a: 0, g: 1 };
    const cands = [ref, ...S.alts];
    const hits = cands.map(c => {
      for (let k = 1; k <= WAYPOINTS; k++) {
        const [x, y] = pt(S, c, 1, k / WAYPOINTS);
        for (let j = 0; j < S.agents.length; j++) {
          const o = S.agents[j];
          if (Math.abs(x - o.x) < 2 * HALF_L + 1 && Math.abs(y - o.y) < 2 * HALF_W + 1) return { k, agent: j };
        }
      }
      return null;
    });
    let best = 0;
    let bestCost = Infinity;
    cands.forEach((c, i) => {
      const cost = Math.abs(c.a) / 16 + Math.abs(1 - c.g) * 5;
      if (!hits[i] && cost < bestCost) { best = i; bestCost = cost; }
    });
    const chosen = cands[best];
    const refHit = hits[0];
    let worst = null;
    if (refHit) {
      for (let k = 1; k <= WAYPOINTS; k++) {
        const [x, y] = pt(S, ref, 1, k / WAYPOINTS);
        S.agents.forEach((o, j) => {
          const area = Math.max(0, 2 * HALF_L - Math.abs(x - o.x)) * Math.max(0, 2 * HALF_W - Math.abs(y - o.y));
          if (area > 0 && (!worst || area > worst.area)) worst = { k, agent: j, area };
        });
      }
    }
    const added = hits.slice(1).filter(Boolean).length;
    let outcome;
    if (best === 0) outcome = 'No alternative does better, so the original plan is kept.';
    else if (!refHit) outcome = 'An equally safe alternative replaces the original plan.';
    else if (Math.abs(chosen.a) < 4 && chosen.g < 0.97) outcome = 'Slowing down along the same path removes the collision.';
    else outcome = `A small shift to the ${chosen.a < 0 ? 'left' : 'right'} removes the collision.`;
    return {
      ...S,
      cands,
      hits,
      best,
      outcome,
      bestLine: linePath(S, chosen, 1, 1),
      worst,
      refNote: !refHit ? 'It stays clear of nearby vehicles.'
        : refHit.k === WAYPOINTS ? `At ${refHit.k * 0.5} s its footprint overlaps ${S.obstacle}.`
        : `From ${refHit.k * 0.5} s on, its footprint overlaps ${S.obstacle}.`,
      ruleNote: refHit
        ? 'Alternatives that still collide are ruled out.'
        : added > 1 ? 'Alternatives that would add a collision are ruled out.' : 'An alternative that would add a collision is ruled out.'
    };
  });

  const el = (tag, attrs = {}, parent = layer) => {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.appendChild(node);
    return node;
  };
  const set = (node, name, value) => {
    const cache = node.__attrs || (node.__attrs = {});
    if (cache[name] !== value) { cache[name] = value; node.setAttribute(name, value); }
  };
  const setText = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
  const trajectory = className => {
    const g = el('g', { class: className });
    return { g, line: el('path', { class: 'scene-traj' }, g), dots: el('path', { class: 'scene-dots' }, g) };
  };
  const footprint = (className, parent = layer) => {
    const g = el('g', {}, parent);
    el('rect', { class: className, x: -HALF_L, y: -HALF_W, width: 2 * HALF_L, height: 2 * HALF_W, rx: 5 }, g);
    return g;
  };

  /* Paint order: other vehicles, alternatives, reference, footprints and deformation, selection, ego. */
  const agents = Array.from({ length: MAX_AGENTS }, () => {
    const g = el('g', { class: 'scene-agent' });
    const body = el('rect', { class: 'scene-agent-body', x: -HALF_L, y: -HALF_W, width: 2 * HALF_L, height: 2 * HALF_W, rx: 5 }, g);
    el('rect', { class: 'scene-agent-glass', x: 10, y: -11, width: 11, height: 22, rx: 2 }, g);
    return { g, body };
  });
  const alts = SCENES[0].alts.map(() => trajectory('scene-cand'));
  const ref = trajectory('scene-ref');
  const refGhost = footprint('scene-ghost is-risk');
  const riskLabel = el('text', { class: 'scene-risk-label', 'text-anchor': 'middle' });
  const halo = el('path', { class: 'scene-sel-halo' });
  const vectors = el('path', { class: 'scene-vec' });
  const selected = trajectory('scene-sel');
  const selGhost = footprint('scene-ghost is-sel');
  const ego = el('g', { class: 'scene-ego' });
  el('rect', { class: 'scene-ego-body', x: -HALF_L, y: -HALF_W, width: 2 * HALF_L, height: 2 * HALF_W, rx: 5 }, ego);
  el('rect', { class: 'scene-ego-glass', x: 10, y: -11, width: 11, height: 22, rx: 2 }, ego);

  let t = 0;
  let loop = 0;
  let paused = false;
  let visible = true;
  let raf = 0;
  let last = null;
  let dotScale = 1;

  const render = () => {
    const P = PLANS[loop % PLANS.length];
    const prog = (a, b) => clamp((t - a) / (b - a));
    const live = 1 - ease(prog(8500, 9000));
    const enter = ease(prog(0, 400));
    const pRef = ease(prog(0, 1200));
    const refHit = P.hits[0];
    const riskAmt = refHit ? ease(prog(1200, 1700)) : 0;
    const sel = ease(prog(4800, 5400));
    const drive = ease(prog(5600, 7600));
    const chosen = P.cands[P.best];

    agents.forEach((agent, i) => {
      const a = P.agents[i];
      if (!a) { set(agent.g, 'opacity', 0); return; }
      const hazard = P.worst && P.worst.agent === i;
      set(agent.g, 'transform', place(a.x, a.y, 0));
      set(agent.g, 'opacity', r2(enter * live));
      set(agent.body, 'fill', hazard ? mix('#d5dbe4', '#f0b44c', riskAmt) : '#d5dbe4');
      set(agent.body, 'stroke', hazard ? mix('#9aa6b6', '#9a5f0f', riskAmt) : '#9aa6b6');
    });

    alts.forEach((alt, j) => {
      const i = j + 1;
      const c = P.cands[i];
      const start = 1900 + j * 60;
      const d = ease(prog(start, start + 1100));
      const rj = P.hits[i] ? ease(prog(3600 + j * 120, 3900 + j * 120)) : 0;
      const color = mix(BASE, REJECTED, rj);
      set(alt.line, 'd', d > 0 ? linePath(P, c, d, 1) : '');
      set(alt.dots, 'd', d > 0 ? dotsPath(P, c, d, 1, 2.2 * dotScale) : '');
      set(alt.line, 'stroke', color);
      set(alt.dots, 'fill', color);
      set(alt.line, 'stroke-dasharray', rj > 0.5 ? '4 4' : 'none');
      set(alt.g, 'opacity', r2(d * (1 - 0.35 * rj) * (1 - 0.55 * sel * (i === P.best ? 0 : 1)) * live));
    });

    set(ref.line, 'd', linePath(P, P.cands[0], 0, pRef));
    set(ref.dots, 'd', dotsPath(P, P.cands[0], 0, pRef, 2.8 * dotScale));
    set(ref.line, 'stroke', DEEP);
    set(ref.dots, 'fill', DEEP);
    set(ref.line, 'stroke-width', 3);
    set(ref.g, 'opacity', r2(live * (P.best === 0 ? 1 : 1 - 0.45 * sel)));

    if (P.worst) {
      const s = P.worst.k / WAYPOINTS;
      const [gx, gy] = pt(P, P.cands[0], 0, s);
      set(refGhost, 'transform', place(gx, gy, heading(P, P.cands[0], 0, s)));
      set(riskLabel, 'x', r1(gx));
      set(riskLabel, 'y', r1(gy - HALF_W - 9));
      setText(riskLabel, `Footprint at ${P.worst.k * 0.5} s`);
    }
    set(refGhost, 'opacity', r2(riskAmt * (1 - 0.4 * sel) * live));
    set(riskLabel, 'opacity', r2(riskAmt * (1 - prog(1900, 2300))));

    /* The chosen candidate, drawn on top, with its per-waypoint displacement from the reference. */
    const replaced = P.best !== 0;
    set(halo, 'd', sel > 0 ? P.bestLine : '');
    set(halo, 'opacity', r2(0.16 * sel * live));
    set(selected.line, 'd', sel > 0 ? P.bestLine : '');
    set(selected.dots, 'd', sel > 0 ? dotsPath(P, chosen, 1, 1, 3 * dotScale) : '');
    set(selected.g, 'opacity', r2(sel * live));
    let vec = '';
    if (replaced && sel > 0) {
      for (let k = 1; k <= WAYPOINTS; k++) {
        const [ax, ay] = pt(P, P.cands[0], 0, k / WAYPOINTS);
        const [bx, by] = pt(P, chosen, 1, k / WAYPOINTS);
        vec += `M${r1(ax)} ${r1(ay)} L${r1(bx)} ${r1(by)} `;
      }
    }
    set(vectors, 'd', vec);
    set(vectors, 'opacity', r2(0.9 * sel * live));
    if (replaced && P.worst) {
      const s = P.worst.k / WAYPOINTS;
      const [sx, sy] = pt(P, chosen, 1, s);
      set(selGhost, 'transform', place(sx, sy, heading(P, chosen, 1, s)));
      set(selGhost, 'opacity', r2(sel * (1 - prog(5600, 6000)) * live));
    } else {
      set(selGhost, 'opacity', 0);
    }

    const [ex, ey] = pt(P, chosen, 1, drive);
    set(ego, 'transform', place(ex, ey, heading(P, chosen, 1, drive)));
    set(ego, 'opacity', r2(enter * live));

    const phase = t < 1900 ? 0 : t < 3600 ? 1 : 2;
    const fills = [prog(0, 1900), prog(1900, 3600), prog(3600, 5600)];
    steps.forEach((step, i) => {
      step.classList.toggle('is-active', i === phase);
      if (stepBars[i]) stepBars[i].style.transform = `scaleX(${r2(fills[i])})`;
    });

    let status;
    if (t < 1200) status = 'The frozen planner proposes its trajectory.';
    else if (t < 1900) status = P.refNote;
    else if (t < 3600) status = 'Alternatives are small deformations of that plan, along and across its path.';
    else if (t < 4800) status = P.ruleNote;
    else status = P.outcome;
    setText(statusEl, status);
    setText(noteEl, `${P.label} Illustrative scene, not model output.`);
  };

  const frame = now => {
    raf = 0;
    if (last !== null) {
      t += Math.min(now - last, 100);
      if (t >= LOOP) { t -= LOOP; loop += 1; }
    }
    last = now;
    render();
    schedule();
  };
  function schedule() {
    if (!paused && visible && !document.hidden && !raf) raf = requestAnimationFrame(frame);
  }
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = null;
  };

  const syncToggle = () => {
    if (!toggle) return;
    toggle.classList.toggle('is-paused', paused);
    setText(toggleLabel, paused ? 'Play' : 'Pause');
    toggle.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
  };
  toggle?.addEventListener('click', () => {
    paused = !paused;
    syncToggle();
    if (paused) stop(); else schedule();
  });

  /* Waypoint dots stay legible when the scene is scaled down on small screens. */
  const measure = () => {
    const width = svg.getBoundingClientRect().width || VIEW_WIDTH;
    const next = r2(Math.min(1.8, Math.max(1, (0.72 * VIEW_WIDTH) / width)));
    if (next !== dotScale) { dotScale = next; render(); }
  };
  window.addEventListener('resize', measure, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule(); else stop();
    }).observe(scene);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : schedule()));

  /* Reduced motion: start on the selection frame, still, until the visitor presses Play. */
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    t = 5500;
    paused = true;
  }
  measure();
  syncToggle();
  render();
  schedule();
})();
