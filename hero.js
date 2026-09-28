// Hero animation: reference plan -> reference-anchored alternatives -> relative selection.
// Illustrative only; the geometry below is hand-set and is not model output.
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

  const LOOP = 9000;
  const X0 = 108;
  const LEN = 500;
  const BASE = '#9cb2d9';
  const REJECTED = '#c3cad6';
  const DEEP = '#182c49';

  // Index 0 is the frozen planner's reference. a = normal offset (negative = ego's left), g = progress scale.
  const CANDIDATES = [
    { a: 0, g: 1 },
    { a: -72, g: 1 },
    { a: -46, g: 0.97 },
    { a: -24, g: 0.98 },
    { a: 24, g: 0.96 },
    { a: 46, g: 0.93 },
    { a: 0, g: 0.58 }
  ];
  const SCENES = [
    { label: 'Vehicle cutting in.', agents: [{ x: 478, y: 236, rot: -14, hazard: true }, { x: 640, y: 156, rot: 0 }] },
    { label: 'Clear lane.', agents: [{ x: 470, y: 290, rot: 0 }, { x: 640, y: 156, rot: 0 }] }
  ];

  const clamp = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = v => { v = clamp(v); return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2; };
  const smooth = s => s * s * (3 - 2 * s);
  const r1 = v => Math.round(v * 10) / 10;
  const r2 = v => Math.round(v * 100) / 100;
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, m) => {
    const A = hex(a), B = hex(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * m)).join(',')})`;
  };

  const refY = u => 220 - 8 * u * u;
  const pt = (c, d, s) => {
    const u = s * (1 + (c.g - 1) * d);
    return [X0 + LEN * u, refY(u) + c.a * d * smooth(s)];
  };
  const linePath = (c, d, upTo) => {
    if (upTo < 0.01) return '';
    let out = '';
    for (let i = 0; i <= 36; i++) {
      const p = pt(c, d, (i / 36) * upTo);
      out += `${i ? ' L' : 'M'}${r1(p[0])} ${r1(p[1])}`;
    }
    return out;
  };
  // Waypoints every 0.5 s over a 3 s horizon, drawn as one path of small circles.
  const dotsPath = (c, d, upTo, radius) => {
    const r = r2(radius);
    let out = '';
    for (let k = 1; k <= 6; k++) {
      if (k / 6 > upTo + 0.001) break;
      const p = pt(c, d, k / 6);
      out += `M${r1(p[0] - r)} ${r1(p[1])} a${r} ${r} 0 1 0 ${r2(2 * r)} 0 a${r} ${r} 0 1 0 ${r2(-2 * r)} 0 `;
    }
    return out;
  };
  const cross = (x, y) => `M${r1(x - 5)} ${r1(y - 5)} L${r1(x + 5)} ${r1(y + 5)} M${r1(x + 5)} ${r1(y - 5)} L${r1(x - 5)} ${r1(y + 5)}`;

  // Per scene: where each candidate first comes within 14 px of another vehicle, and which one is kept.
  const PLANS = SCENES.map(spec => {
    const boxes = spec.agents.map(a => {
      const rad = Math.abs(a.rot) * Math.PI / 180;
      const hx = 29 * Math.cos(rad) + 14 * Math.sin(rad);
      const hy = 29 * Math.sin(rad) + 14 * Math.cos(rad);
      return { x1: a.x - hx, x2: a.x + hx, y1: a.y - hy, y2: a.y + hy };
    });
    const hits = CANDIDATES.map(c => {
      for (let i = 0; i <= 60; i++) {
        const [x, y] = pt(c, 1, i / 60);
        for (const b of boxes) {
          const dx = Math.max(b.x1 - x, 0, x - b.x2);
          const dy = Math.max(b.y1 - y, 0, y - b.y2);
          if (dx * dx + dy * dy < 196) return i / 60;
        }
      }
      return -1;
    });
    let best = 0;
    let bestCost = Infinity;
    CANDIDATES.forEach((c, i) => {
      const cost = Math.abs(c.a) / 72 + Math.abs(1 - c.g) * 1.4;
      if (hits[i] < 0 && cost < bestCost) { best = i; bestCost = cost; }
    });
    const chosen = CANDIDATES[best];
    const outcome = best === 0
      ? 'No alternative does better, so the original plan is kept.'
      : chosen.a < 0 ? 'A small shift to the left replaces the original plan.'
      : chosen.a > 0 ? 'A small shift to the right replaces the original plan.'
      : 'Braking earlier replaces the original plan.';
    return { ...spec, hits, best, outcome, bestLine: linePath(chosen, 1, 1) };
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

  // Paint order: other vehicles, alternatives, reference, markers, selection, ego.
  const agents = SCENES[0].agents.map(() => {
    const g = el('g', { class: 'scene-agent' });
    const body = el('rect', { class: 'scene-agent-body', x: -29, y: -14, width: 58, height: 28, rx: 6 }, g);
    el('rect', { class: 'scene-agent-glass', x: 9, y: -10, width: 10, height: 20, rx: 2 }, g);
    return { g, body };
  });
  const alts = CANDIDATES.slice(1).map(() => trajectory('scene-cand'));
  const ref = trajectory('scene-ref');
  const marks = alts.map(() => el('path', { class: 'scene-x' }));
  const risk = el('circle', { class: 'scene-risk', r: 6 });
  const riskLabel = el('text', { class: 'scene-risk-label', 'text-anchor': 'end' });
  riskLabel.textContent = 'Collision risk';
  const halo = el('path', { class: 'scene-sel-halo' });
  const selected = trajectory('scene-sel');
  const ego = el('g', { class: 'scene-ego' });
  el('rect', { class: 'scene-ego-body', x: -48, y: -12, width: 48, height: 24, rx: 6 }, ego);
  el('rect', { class: 'scene-ego-glass', x: -17, y: -9, width: 9, height: 18, rx: 2 }, ego);

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
    const riskAmt = P.hits[0] >= 0 ? ease(prog(1200, 1700)) : 0;
    const sel = ease(prog(4800, 5400));
    const drive = ease(prog(5600, 7600));
    const rejected = i => (P.hits[i] >= 0 ? ease(prog(3600 + i * 140, 3900 + i * 140)) : 0);

    agents.forEach((agent, i) => {
      const a = P.agents[i];
      set(agent.g, 'transform', `translate(${a.x} ${a.y}) rotate(${a.rot})`);
      set(agent.g, 'opacity', r2(enter * live));
      set(agent.body, 'fill', a.hazard ? mix('#d5dbe4', '#f0b44c', riskAmt) : '#d5dbe4');
      set(agent.body, 'stroke', a.hazard ? mix('#9aa6b6', '#9a5f0f', riskAmt) : '#9aa6b6');
    });

    alts.forEach((alt, j) => {
      const i = j + 1;
      const c = CANDIDATES[i];
      const start = 1900 + j * 110;
      const d = ease(prog(start, start + 1000));
      const rj = rejected(i);
      const color = mix(BASE, REJECTED, rj);
      set(alt.line, 'd', d > 0 ? linePath(c, d, 1) : '');
      set(alt.dots, 'd', d > 0 ? dotsPath(c, d, 1, 2.4 * dotScale) : '');
      set(alt.line, 'stroke', color);
      set(alt.dots, 'fill', color);
      set(alt.line, 'stroke-dasharray', rj > 0.5 ? '4 5' : 'none');
      set(alt.g, 'opacity', r2(d * (1 - 0.3 * rj) * (1 - 0.5 * sel * (i === P.best ? 0 : 1)) * live));
      const hit = P.hits[i];
      if (hit >= 0 && rj > 0) {
        const [x, y] = pt(c, 1, hit);
        set(marks[j], 'd', cross(x, y));
      } else {
        set(marks[j], 'd', '');
      }
      set(marks[j], 'opacity', r2(rj * (1 - 0.4 * sel) * live));
    });

    const rr = rejected(0);
    const refColor = mix(DEEP, REJECTED, rr);
    set(ref.line, 'd', linePath(CANDIDATES[0], 0, pRef));
    set(ref.dots, 'd', dotsPath(CANDIDATES[0], 0, pRef, 3 * dotScale));
    set(ref.line, 'stroke', refColor);
    set(ref.dots, 'fill', refColor);
    set(ref.line, 'stroke-width', r2(3 - 1.2 * rr));
    set(ref.line, 'stroke-dasharray', rr > 0.5 ? '5 5' : 'none');
    set(ref.g, 'opacity', r2((1 - 0.35 * rr) * live * (P.best === 0 ? 1 : 1 - 0.3 * sel)));

    const [hx, hy] = P.hits[0] >= 0 ? pt(CANDIDATES[0], 0, P.hits[0]) : [0, 0];
    set(risk, 'cx', r1(hx));
    set(risk, 'cy', r1(hy));
    set(risk, 'r', r1(6 + 8 * riskAmt));
    set(risk, 'opacity', r2(riskAmt * (1 - 0.5 * sel) * live));
    set(riskLabel, 'x', r1(hx - 4));
    set(riskLabel, 'y', r1(hy - 22));
    set(riskLabel, 'opacity', r2(riskAmt * (1 - prog(1900, 2300))));

    const chosen = CANDIDATES[P.best];
    set(halo, 'd', sel > 0 ? P.bestLine : '');
    set(halo, 'opacity', r2(0.16 * sel * live));
    set(selected.line, 'd', sel > 0 ? P.bestLine : '');
    set(selected.dots, 'd', sel > 0 ? dotsPath(chosen, 1, 1, 3.2 * dotScale) : '');
    set(selected.g, 'opacity', r2(sel * live));

    const [ex, ey] = pt(chosen, 1, drive);
    const e1 = pt(chosen, 1, Math.max(0, drive - 0.02));
    const e2 = pt(chosen, 1, Math.min(1, drive + 0.02));
    const angle = Math.atan2(e2[1] - e1[1], e2[0] - e1[0]) * 180 / Math.PI;
    set(ego, 'transform', `translate(${r1(ex)} ${r1(ey)}) rotate(${r1(angle)})`);
    set(ego, 'opacity', r2(enter * live));

    const phase = t < 1900 ? 0 : t < 3600 ? 1 : 2;
    const fills = [prog(0, 1900), prog(1900, 3600), prog(3600, 5600)];
    steps.forEach((step, i) => {
      step.classList.toggle('is-active', i === phase);
      if (stepBars[i]) stepBars[i].style.transform = `scaleX(${r2(fills[i])})`;
    });

    let status;
    if (t < 1200) status = 'The frozen planner proposes its trajectory.';
    else if (t < 1900) status = P.hits[0] >= 0 ? 'That plan comes too close to a vehicle cutting in.' : 'That plan keeps clear of nearby vehicles.';
    else if (t < 3600) status = 'Alternatives are generated as deformations of that plan.';
    else if (t < 4800) status = 'Candidates that worsen collision are ruled out.';
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

  // Dots stay legible when the scene is scaled down on small screens.
  const measure = () => {
    const width = svg.getBoundingClientRect().width || 720;
    const next = r2(Math.min(1.8, Math.max(1, (0.72 * 720) / width)));
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

  // Reduced motion: start on the selection frame, still, until the visitor presses Play.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    t = 5500;
    paused = true;
  }
  measure();
  syncToggle();
  render();
  schedule();
})();
