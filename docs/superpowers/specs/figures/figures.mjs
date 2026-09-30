// Generates the SVG figures for 2026-09-30-will-to-deliverance-design.md.
// Run: node figures.mjs   (writes fig-*.svg next to this file; PNGs are rendered by render.sh)
// Palette: dataviz reference instance (light mode), categorical slots 1-3 validated all-pairs.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = dirname(fileURLToPath(import.meta.url));
const C = {
  surface: '#fcfcfb', ink: '#0b0b0b', ink2: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7',
  s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', s1light: '#cde2fb', s1mid: '#86b6ef',
  good: '#0ca30c', critical: '#d03b3b', warning: '#fab219',
};
const FONT = `font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${o.size ?? 13}" fill="${o.fill ?? C.ink}" text-anchor="${o.anchor ?? 'start'}" font-weight="${o.weight ?? 'normal'}" dominant-baseline="${o.base ?? 'middle'}">${esc(s)}</text>`;
const box = (x, y, w, h, s, o = {}) => {
  const lines = Array.isArray(s) ? s : [s];
  const lh = 17, y0 = y + h / 2 - ((lines.length - 1) * lh) / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${o.fill ?? '#ffffff'}" stroke="${o.stroke ?? C.axis}" stroke-width="1.5"/>` +
    lines.map((l, i) => text(x + w / 2, y0 + i * lh, l, { anchor: 'middle', size: o.size ?? 13, fill: o.ink ?? C.ink, weight: i === 0 && o.boldFirst ? '600' : 'normal' })).join('');
};
const arrow = (x1, y1, x2, y2, label, o = {}) => {
  const id = 'a' + Math.random().toString(36).slice(2, 7);
  const mid = [(x1 + x2) / 2, (y1 + y2) / 2];
  return `<defs><marker id="${id}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${o.stroke ?? C.ink2}"/></marker></defs>` +
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke ?? C.ink2}" stroke-width="1.5" marker-end="url(#${id})" ${o.dash ? 'stroke-dasharray="5 4"' : ''}/>` +
    (label ? `<rect x="${mid[0] - label.length * 3.6 - 4}" y="${mid[1] - 9 + (o.dy ?? 0)}" width="${label.length * 7.2 + 8}" height="18" fill="${C.surface}"/>` + text(mid[0], mid[1] + (o.dy ?? 0), label, { anchor: 'middle', size: 12, fill: C.ink2 }) : '');
};
const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">` +
  `<rect width="${w}" height="${h}" fill="${C.surface}"/>` + text(24, 26, title, { size: 16, weight: '600' }) + body + `</svg>`;
const write = (name, s) => writeFileSync(join(out, name), s);

// ---------- Figure 1: architecture ----------
{
  let b = '';
  const col = [[30, 150], [250, 160], [474, 226], [770, 190]], top = 70;
  const head = (i, t) => text(col[i][0] + col[i][1] / 2, top - 14, t, { anchor: 'middle', size: 12, fill: C.muted, weight: '600' });
  b += head(0, 'INTAKE (any)') + head(1, 'ROUTER') + head(2, 'RUNNER (per developer)') + head(3, 'MATERIALISER (any)');
  ['Slack message', 'Jira ticket', 'Prompt / CLI'].forEach((s, i) => (b += box(col[0][0], top + i * 62, col[0][1], 44, s)));
  b += box(col[1][0], top + 40, col[1][1], 108, ['will.yml', 'normalise → Will', 'pick runner from', 'developers.yaml'], { boldFirst: true, fill: '#f4f4f1', size: 12 });
  const runners = [['conclave executor', 'Claude Cloud routine:', 'execution → judge ⇄ atone'], ['another dev’s harness', 'image / reusable workflow', 'any host that sends the event'], ['bare model', 'one tool loop', 'in an Actions job']];
  runners.forEach((s, i) => (b += box(col[2][0], top + i * 62, col[2][1], 54, s, { boldFirst: true, size: 11 })));
  const mats = [['environment', 'mp-<ticket>.stage…'], ['document', 'repo PR'], ['Confluence page', 'Atlassian REST']];
  mats.forEach((s, i) => (b += box(col[3][0], top + i * 62, col[3][1], 48, s, { boldFirst: true, size: 12 })));
  const y = top + 94;
  const gapArrow = (from, to, lines) => {
    const x1 = col[from][0] + col[from][1], x2 = col[to][0], mid = (x1 + x2) / 2;
    return arrow(x1, y, x2, y, '') + lines.map((l, k) => text(mid, y - 22 + k * 13, l, { anchor: 'middle', size: 11, fill: C.ink2 })).join('');
  };
  b += gapArrow(0, 1, ['Will', 'event']) + gapArrow(1, 2, ['fire /', 'uses:']) + gapArrow(2, 3, ['Deliverance', 'event']);
  const yb = top + 3 * 62 + 20;
  b += `<path d="M ${col[3][0] + col[3][1] / 2} ${top + 3 * 62 - 14} L ${col[3][0] + col[3][1] / 2} ${yb} L ${col[0][0] + col[0][1] / 2} ${yb} L ${col[0][0] + col[0][1] / 2} ${top + 3 * 62 - 10}" fill="none" stroke="${C.s1}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  const lx = (col[0][0] + col[3][0] + col[3][1]) / 2;
  b += `<rect x="${lx - 130}" y="${yb - 9}" width="260" height="18" fill="${C.surface}"/>` + text(lx, yb, 'post-back: URL, PRs, cost · ledger row', { anchor: 'middle', size: 12, fill: C.s1 });
  b += text(24, yb + 34, 'Runners hold a repo token and a model credential only. The deploy role lives in the materialiser job.', { size: 12, fill: C.ink2 });
  write('fig-1-architecture.svg', svg(980, 340, b, 'Figure 1 · From Will to Deliverance: three ports around one workflow'));
}

// ---------- Figure 2: one run, timeline ----------
{
  const rows = [
    ['Intake (Slack → dispatch)', 0, 1, C.s3], ['Router (will.yml)', 1, 2, C.s3],
    ['Runner · execution (spec → plan → code, draft PRs)', 2, 77, C.s1], ['Runner · judgement ⇄ atonement ×2', 77, 117, C.s1],
    ['CI · frontend + backend image builds (parallel)', 40, 68, C.s2], ['Materialiser · Deploy Commit (mp-<ticket>)', 117, 123, C.s3],
    ['Post-back + ledger', 123, 124, C.s3],
  ];
  const x0 = 330, x1 = 940, y0 = 60, rh = 34, tmax = 130;
  const X = (t) => x0 + ((x1 - x0) * t) / tmax;
  let b = '';
  for (let t = 0; t <= 120; t += 20) b += `<line x1="${X(t)}" y1="${y0 - 6}" x2="${X(t)}" y2="${y0 + rows.length * rh}" stroke="${C.grid}"/>` + text(X(t), y0 + rows.length * rh + 14, `${t} min`, { anchor: 'middle', size: 11, fill: C.muted });
  rows.forEach(([l, s, e, c], i) => {
    const y = y0 + i * rh;
    b += text(x0 - 12, y + rh / 2, l, { anchor: 'end', size: 12 });
    const w = Math.max(X(e) - X(s), 4);
    b += `<rect x="${X(s)}" y="${y + 8}" width="${w}" height="${rh - 16}" rx="3" fill="${c}"/>`;
    b += text(X(e) + 6, y + rh / 2, `${e - s} min`, { size: 11, fill: C.ink2 });
  });
  const yl = y0 + rows.length * rh + 40;
  [[C.s1, 'runner (developer’s Protocol)'], [C.s2, 'CI image builds'], [C.s3, 'pipeline plumbing']].forEach(([c, l], i) => {
    b += `<rect x="${x0 + i * 220}" y="${yl - 6}" width="12" height="12" rx="2" fill="${c}"/>` + text(x0 + i * 220 + 18, yl, l, { size: 12, fill: C.ink2 });
  });
  b += text(24, yl + 28, 'Typical wall-clock ≈ 2 h from message to URL; the environment then lives 72 h unless the PR closes first.', { size: 12, fill: C.ink2 });
  write('fig-2-run-timeline.svg', svg(980, 370, b, 'Figure 2 · One run, Slack message to running environment (typical durations)'));
}

// ---------- Figure 3: naming decision ----------
{
  const rows = [
    ['mp-1234.stage.platform.yatta.de', 'existing *.stage.platform.yatta.de on the nginx NLB', 'external-dns already owns the stage zone (same path as git-*)', 'chosen · zero infra change', C.good, '✔'],
    ['MP-1234.platform.yatta.de', 'needs a new ACM *.platform.yatta.de on the stage NLB', 'platform.yatta.de is production’s apex: cookie scope, prod cert, catch-all collisions', 'rejected for now', C.critical, '✖'],
    ['dev.platform.yatta.de', 'its own tier: EKS, RDS, NAT, ALB, GA', 'a fourth long-lived tier, one branch at a time', 'not built · ≈ $700 / month fixed', C.warning, '▲'],
  ];
  const cols = [40, 300, 545, 775];
  let b = '';
  ['Hostname', 'Certificate', 'DNS / placement', 'Verdict'].forEach((h, i) => (b += text(cols[i], 58, h, { size: 12, fill: C.muted, weight: '600' })));
  b += `<line x1="24" y1="70" x2="956" y2="70" stroke="${C.axis}"/>`;
  rows.forEach(([h, cert, dns, v, c, icon], i) => {
    const y = 100 + i * 64;
    b += text(cols[0], y, h, { size: 13, weight: '600' });
    const wrap = (s, x, w) => { const words = s.split(' '); const lines = []; let cur = ''; for (const wd of words) { if ((cur + ' ' + wd).length * 6.6 > w) { lines.push(cur); cur = wd; } else cur = cur ? cur + ' ' + wd : wd; } lines.push(cur); return lines.map((l, k) => text(x, y - 8 + k * 16, l, { size: 12, fill: C.ink2 })).join(''); };
    b += wrap(cert, cols[1], 235) + wrap(dns, cols[2], 220);
    b += `<circle cx="${cols[3] + 8}" cy="${y}" r="9" fill="${c}"/>` + text(cols[3] + 8, y + 1, icon, { anchor: 'middle', size: 11, fill: '#fff', weight: '700' }) + v.split(' · ').map((l, k) => text(cols[3] + 24, y - 8 + k * 16, l, { size: 12 })).join('');
    b += `<line x1="24" y1="${y + 32}" x2="956" y2="${y + 32}" stroke="${C.grid}"/>`;
  });
  write('fig-3-naming.svg', svg(980, 310, b, 'Figure 3 · Where a ticket environment lives: three hostname options'));
}

// ---------- Figure 4: namespace composition (memory requests) ----------
{
  const items = [['marketplace backend', 2048], ['Postgres 17.6', 2048], ['emailproxy', 1024], ['Valkey', 128], ['Temporal', 128], ['usercheck mock', 128], ['Adyen mock', 128], ['OAuth mock', 128], ['mailpit', 64], ['shop-ui frontend', 64], ['e2e-auth validator', 32]];
  const x0 = 200, x1 = 900, y0 = 56, rh = 22, max = 2200;
  const X = (v) => x0 + ((x1 - x0) * v) / max;
  let b = '';
  [0, 500, 1000, 1500, 2000].forEach((t) => (b += `<line x1="${X(t)}" y1="${y0 - 4}" x2="${X(t)}" y2="${y0 + items.length * rh}" stroke="${C.grid}"/>` + text(X(t), y0 + items.length * rh + 12, `${t} MiB`, { anchor: 'middle', size: 11, fill: C.muted })));
  items.forEach(([l, v], i) => {
    const y = y0 + i * rh;
    b += text(x0 - 10, y + rh / 2, l, { anchor: 'end', size: 12 });
    b += `<rect x="${x0}" y="${y + 4}" width="${X(v) - x0}" height="${rh - 8}" rx="3" fill="${C.s1}"/>` + text(X(v) + 6, y + rh / 2, `${v}`, { size: 11, fill: C.ink2 });
  });
  const total = items.reduce((a, [, v]) => a + v, 0);
  const yt = y0 + items.length * rh + 40;
  b += text(24, yt, `Total requested ≈ ${(total / 1024).toFixed(1)} GiB per environment  ·  one m6a.xlarge stage node has ≈ 13 GiB allocatable  ·  2 environments per node  ·  marginal ≈ $0.10 / h`, { size: 12, fill: C.ink2 });
  b += text(24, yt + 20, 'Source: marketplace kubernetes/e2e/*.yaml and shop-ui kubernetes/deployment.yaml (requests, not limits; the backend may burst to 2 vCPU).', { size: 11, fill: C.muted });
  write('fig-4-namespace.svg', svg(980, 380, b, 'Figure 4 · What one ephemeral namespace requests (memory, MiB)'));
}

// ---------- Figure 5: AI cost per run, small multiples ----------
{
  const models = ['Fable 5.1', 'Opus 5.5', 'Sonnet 5.5', 'Haiku 4.5'];
  const panels = [['execution only', [46, 21, 13, 6.5]], ['execution + 2 judgement + 2 atonement', [95, 43, 27, 13]], ['bare-model runner', [15, 6.8, 4.2, 2.1]]];
  const pw = 290, ph = 220, y0 = 60, max = 100;
  let b = '';
  panels.forEach(([title, vals], p) => {
    const px = 40 + p * (pw + 25);
    b += text(px + pw / 2, y0 - 14, title, { anchor: 'middle', size: 12, weight: '600', fill: C.ink2 });
    [0, 25, 50, 75, 100].forEach((t) => { const y = y0 + ph - (ph * t) / max; b += `<line x1="${px}" y1="${y}" x2="${px + pw}" y2="${y}" stroke="${C.grid}"/>` + (p === 0 ? text(px - 6, y, `$${t}`, { anchor: 'end', size: 11, fill: C.muted }) : ''); });
    const bw = 44, gap = (pw - 4 * bw) / 5;
    vals.forEach((v, i) => {
      const x = px + gap + i * (bw + gap), h = (ph * v) / max, y = y0 + ph - h;
      b += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${C.s1}"/>` + text(x + bw / 2, y - 9, `$${v}`, { anchor: 'middle', size: 11 }) + text(x + bw / 2, y0 + ph + 12, models[i], { anchor: 'middle', size: 11, fill: C.ink2 });
    });
    b += `<line x1="${px}" y1="${y0 + ph}" x2="${px + pw}" y2="${y0 + ph}" stroke="${C.axis}"/>`;
  });
  b += text(24, y0 + ph + 44, 'List prices 2026-09-30; token assumptions per step in §7.3. Haiku is shown for completeness and is not capable enough for a multi-repo execution.', { size: 11, fill: C.muted });
  write('fig-5-cost-per-run.svg', svg(980, 350, b, 'Figure 5 · AI cost of one ticket, by runner shape and model (USD, API rates)'));
}

// ---------- Figure 6: monthly scenarios, stacked ----------
{
  const scen = [['1 dev · 8 tickets\nowner’s Protocol, Fable 5.1', [760, 60, 5]], ['5 devs · 40 tickets\nmixed runners ≈ Opus 5.5', [1720, 450, 26]], ['40 tickets\nbare model, Sonnet 5.5', [168, 450, 26]], ['a long-lived dev tier\n0 tickets', [0, 700, 0]]];
  const series = [['AI', C.s1], ['environments + nodes', C.s2], ['GitHub Actions', C.s3]];
  const x0 = 80, y0 = 60, ph = 230, max = 2400, bw = 120, step = 215;
  const Y = (v) => y0 + ph - (ph * v) / max;
  let b = '';
  [0, 600, 1200, 1800, 2400].forEach((t) => (b += `<line x1="${x0}" y1="${Y(t)}" x2="${x0 + 4 * step}" y2="${Y(t)}" stroke="${C.grid}"/>` + text(x0 - 6, Y(t), `$${t.toLocaleString('en-US')}`, { anchor: 'end', size: 11, fill: C.muted })));
  scen.forEach(([label, vals], i) => {
    const x = x0 + i * step + 40; let acc = 0;
    vals.forEach((v, k) => { if (!v) return; const y1 = Y(acc), y2 = Y(acc + v); b += `<rect x="${x}" y="${y2 + (acc ? 1 : 0)}" width="${bw}" height="${Math.max(y1 - y2 - (acc ? 2 : 0), 1)}" rx="${k === vals.findLastIndex(Boolean) ? 3 : 0}" fill="${series[k][1]}"/>`; acc += v; });
    b += text(x + bw / 2, Y(acc) - 10, `≈ $${(Math.round(acc / 5) * 5).toLocaleString('en-US')}`, { anchor: 'middle', size: 12, weight: '600' });
    label.split('\n').forEach((l, k) => (b += text(x + bw / 2, y0 + ph + 14 + k * 15, l, { anchor: 'middle', size: 11, fill: C.ink2 })));
  });
  b += `<line x1="${x0}" y1="${Y(0)}" x2="${x0 + 4 * step}" y2="${Y(0)}" stroke="${C.axis}"/>`;
  series.forEach(([l, c], i) => (b += `<rect x="${x0 + i * 200}" y="${y0 + ph + 52}" width="12" height="12" rx="2" fill="${c}"/>` + text(x0 + i * 200 + 18, y0 + ph + 58, l, { size: 12, fill: C.ink2 })));
  b += text(24, y0 + ph + 84, 'Seat-based billing replaces the AI bar with a flat $100–200 per developer, subject to rate limits. The dev tier serves one branch at a time.', { size: 11, fill: C.muted });
  write('fig-6-monthly.svg', svg(980, 400, b, 'Figure 6 · Monthly cost by scenario (USD, list prices)'));
}

// ---------- Figure 7: one environment over 30 days ----------
{
  const x0 = 70, x1 = 760, y0 = 50, y1 = 250, days = 30, max = 80;
  const X = (d) => x0 + ((x1 - x0) * d) / days, Y = (v) => y1 - ((y1 - y0) * v) / max;
  let b = '';
  [0, 20, 40, 60, 80].forEach((t) => (b += `<line x1="${x0}" y1="${Y(t)}" x2="${x1}" y2="${Y(t)}" stroke="${C.grid}"/>` + text(x0 - 6, Y(t), `$${t}`, { anchor: 'end', size: 11, fill: C.muted })));
  [0, 5, 10, 15, 20, 25, 30].forEach((d) => (b += text(X(d), y1 + 14, `day ${d}`, { anchor: 'middle', size: 11, fill: C.muted })));
  b += `<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="${C.axis}"/>`;
  b += `<polyline points="${X(0)},${Y(0)} ${X(30)},${Y(75)}" fill="none" stroke="${C.s2}" stroke-width="2"/>` + text(X(30) + 8, Y(75), 'forgotten: ≈ $75 / month', { size: 12, fill: C.ink2 });
  b += `<polyline points="${X(0)},${Y(0)} ${X(3)},${Y(7.5)} ${X(30)},${Y(7.5)}" fill="none" stroke="${C.s1}" stroke-width="2"/>` + text(X(30) + 8, Y(7.5), '72 h TTL: ≈ $7.50', { size: 12, fill: C.ink2 });
  b += `<line x1="${X(3)}" y1="${Y(7.5)}" x2="${X(3)}" y2="${y1}" stroke="${C.s1}" stroke-dasharray="4 3"/>` + text(X(3) + 6, y1 - 12, 'kube-janitor deletes the namespace', { size: 11, fill: C.s1 });
  [[C.s1, 'with TTL (proposed)'], [C.s2, 'without TTL (today, if Stop Commit is forgotten)']].forEach(([c, l], i) => (b += `<line x1="${x0 + i * 220}" y1="${y1 + 44}" x2="${x0 + i * 220 + 18}" y2="${y1 + 44}" stroke="${c}" stroke-width="2"/>` + text(x0 + i * 220 + 24, y1 + 44, l, { size: 12, fill: C.ink2 })));
  write('fig-7-env-over-time.svg', svg(980, 320, b, 'Figure 7 · Cumulative cost of one ephemeral environment (USD)'));
}

// ---------- Figure 8: phases ----------
{
  const phases = [
    ['0 · Prove it by hand', 1, 1, 'first ledger row with measured tokens, minutes and hours'],
    ['1 · Environment per ticket', 2, 3, 'mp-<ticket>.stage… from a manual dispatch; TTL reaps it'],
    ['2 · The pipeline', 3, 5, 'prompt → environment with no hand steps; conclave routine'],
    ['3 · Intakes + document results', 6, 6, 'Slack and Jira trigger a run; Confluence page materialiser'],
    ['4 · Actuals and guardrails', 7, 8, 'OpenCost + Admin API replace the estimates; budgets enforced'],
    ['5 · Wider namespace (gated)', 9, 12, 'gateway, identity, Portal in the namespace; 2nd developer runner'],
  ];
  const x0 = 290, x1 = 560, y0 = 60, rh = 40, weeks = 12;
  const X = (w) => x0 + ((x1 - x0) * (w - 1)) / weeks;
  let b = '';
  for (let w = 1; w <= 13; w++) b += `<line x1="${X(w)}" y1="${y0 - 6}" x2="${X(w)}" y2="${y0 + phases.length * rh}" stroke="${C.grid}"/>` + (w <= 12 ? text(X(w) + (X(2) - X(1)) / 2, y0 - 14, `w${w}`, { anchor: 'middle', size: 10, fill: C.muted }) : '');
  phases.forEach(([l, s, e, exit], i) => {
    const y = y0 + i * rh, gated = l.includes('gated');
    b += text(x0 - 12, y + rh / 2, l, { anchor: 'end', size: 12, weight: '600' });
    b += `<rect x="${X(s)}" y="${y + 9}" width="${X(e + 1) - X(s)}" height="${rh - 18}" rx="3" fill="${gated ? C.s1mid : C.s1}"/>`;
    if (gated) b += `<polygon points="${X(s) - 8},${y + rh / 2} ${X(s)},${y + rh / 2 - 8} ${X(s) + 8},${y + rh / 2} ${X(s)},${y + rh / 2 + 8}" fill="${C.s2}"/>`;
    { const words = exit.split(' '); const lines = []; let cur = ''; for (const wd of words) { if ((cur + ' ' + wd).length * 6.2 > 390) { lines.push(cur); cur = wd; } else cur = cur ? cur + ' ' + wd : wd; } lines.push(cur); lines.forEach((l, k) => (b += text(x1 + 16, y + rh / 2 - (lines.length - 1) * 7 + k * 14, l, { size: 11, fill: C.ink2 }))); }
  });
  const yl = y0 + phases.length * rh + 24;
  b += `<polygon points="${x0},${yl} ${x0 + 8},${yl - 8} ${x0 + 16},${yl} ${x0 + 8},${yl + 8}" fill="${C.s2}"/>` + text(x0 + 24, yl, 'decision gate: Portal ADR 0001/0002 revisit, org repo placement', { size: 12, fill: C.ink2 });
  b += text(24, yl + 26, 'Weeks are calendar weeks at part-time effort (3–5 engineering days for phases 1–2, 5–8 days for phase 5). Exit criteria on the right.', { size: 11, fill: C.muted });
  write('fig-8-phases.svg', svg(980, 360, b, 'Figure 8 · Phases to get there, with exit criteria'));
}
console.log('ok');
