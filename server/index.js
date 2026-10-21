import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
import { WebSocketServer } from 'ws';
import { MAPS, WEAPONS, collides } from '../shared/map.js';

const KILL_LIMIT = 10, MATCH = 300, RESPAWN = 5, MAX = 5;
const DIFFS = [
  { n: 'Facile', sp: 4.5, spread: 3.5, gap: [0.8, 0.6], range: 22 },
  { n: 'Normal', sp: 7, spread: 1.6, gap: [0.25, 0.35], range: 45 },
  { n: 'Difficile', sp: 9, spread: 0.6, gap: [0.12, 0.15], range: 90 },
];
const PORT = process.env.PORT || 3000;
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist');

const app = express();
app.use(express.json());
app.use(express.static(dist));
app.post('/api/token', async (req, res) => {
  try {
    const r = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.VITE_DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: req.body.code,
      }),
    });
    const data = await r.json();
    if (!data.access_token) { console.error('Erreur Discord :', data); return res.status(400).send(data); }
    res.send({ access_token: data.access_token });
  } catch { res.status(500).send({ error: 'token' }); }
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();
let nextId = 1;
const now = () => Date.now() / 1000;
const send = (ws, o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));
const bcast = (r, o) => { const s = JSON.stringify(o); for (const p of r.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s); };
const bx = r => MAPS[r.map].boxes;
const humans = r => [...r.players.values()].filter(p => !p.bot);

function spawn(r, p) {
  let best = MAPS[r.map].spawns[0], bd = -1;
  for (const s of MAPS[r.map].spawns) {
    let md = 1e9;
    for (const q of r.players.values()) if (q !== p && q.hp > 0) md = Math.min(md, Math.hypot(q.x - s[0], q.z - s[2]));
    md += Math.random() * 3;
    if (md > bd) { bd = md; best = s; }
  }
  Object.assign(p, { x: best[0], y: best[1], z: best[2], vy: 0, hp: 100, ammos: WEAPONS.map(w => w.mag), w: 0, reloading: false, yaw: 0, pitch: 0, last: now() });
  send(p.ws, { t: 'tp', x: p.x, y: p.y, z: p.z });
}

function rayBox(o, d, b) {
  let t0 = 0, t1 = 100;
  const c = [b.x, b.y, b.z], h = [b.w / 2, b.h / 2, b.d / 2];
  for (let i = 0; i < 3; i++) {
    const lo = c[i] - h[i], hi = c[i] + h[i];
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo || o[i] > hi) return Infinity; }
    else {
      let a = (lo - o[i]) / d[i], e = (hi - o[i]) / d[i];
      if (a > e) [a, e] = [e, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, e);
      if (t0 > t1) return Infinity;
    }
  }
  return t0;
}
function raySphere(o, d, c, r) {
  const oc = [c[0] - o[0], c[1] - o[1], c[2] - o[2]];
  const tca = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2];
  if (tca < 0) return Infinity;
  const d2 = oc[0] ** 2 + oc[1] ** 2 + oc[2] ** 2 - tca * tca;
  return d2 > r * r ? Infinity : tca - Math.sqrt(r * r - d2);
}
function visible(r, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1, u = d.map(v => v / l);
  for (const bb of bx(r)) if (rayBox(a, u, bb) < l) return false;
  return true;
}

const startReload = (p, t) => { p.reloading = true; p.reloadEnd = t + WEAPONS[p.w].reload; };

function shoot(r, p, m) {
  const W = WEAPONS[p.w], t = now();
  if (r.over || p.hp <= 0 || p.reloading || t - p.lastShot < W.fire - 0.03) return;
  if (p.ammos[p.w] <= 0) return startReload(p, t);
  if (!Array.isArray(m.d) || !m.d.every(Number.isFinite)) return;
  const l = Math.hypot(...m.d) || 1, d = m.d.map(v => v / l);
  const o = [p.x, p.y + 1.6, p.z];
  p.lastShot = t;
  if (--p.ammos[p.w] === 0) startReload(p, t);
  let wall = 100;
  for (const b of bx(r)) wall = Math.min(wall, rayBox(o, d, b));
  let best = wall, target = null, head = false;
  for (const q of r.players.values()) {
    if (q === p || q.hp <= 0) continue;
    const th = raySphere(o, d, [q.x, q.y + 1.6, q.z], 0.28);
    const tb = raySphere(o, d, [q.x, q.y + 0.85, q.z], 0.5);
    if (th < best) { best = th; target = q; head = true; }
    if (tb < best) { best = tb; target = q; head = false; }
  }
  const e = o.map((v, i) => v + d[i] * Math.min(best, 100));
  bcast(r, { t: 'shot', id: p.id, o, e, w: p.w });
  if (!target) return;
  target.hp -= head ? W.head : W.dmg;
  send(p.ws, { t: 'hit', head });
  if (target.hp <= 0) {
    target.hp = 0; target.deaths++; target.deadAt = t; p.kills++;
    bcast(r, { t: 'kill', k: p.name, v: target.name, head, w: p.w });
    send(target.ws, { t: 'dead', by: p.name, head, secs: RESPAWN });
    if (p.kills >= KILL_LIMIT) endMatch(r);
  }
}

function endMatch(r) {
  if (r.over) return;
  r.over = true;
  const board = [...r.players.values()].sort((a, b) => b.kills - a.kills);
  bcast(r, { t: 'end', winner: board[0]?.name, board: board.map(p => [p.name, p.kills, p.deaths]) });
  setTimeout(() => {
    r.over = false; r.timeLeft = MATCH; r.map = (r.map + 1) % MAPS.length;
    for (const p of r.players.values()) { p.kills = 0; p.deaths = 0; spawn(r, p); }
    bcast(r, { t: 'reset', map: r.map });
  }, 7000);
}

// ---------- IA des bots ----------
function botThink(r, p, t) {
  if (p.hp <= 0 || r.over) return;
  const dt = 0.05, B = bx(r), eye = [p.x, p.y + 1.6, p.z], D = DIFFS[r.diff];
  let tgt = null, bd = 1e9;
  for (const q of r.players.values()) {
    if (q === p || q.hp <= 0) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bd && d < D.range && visible(r, eye, [q.x, q.y + 1.2, q.z])) { bd = d; tgt = q; }
  }
  let mx = 0, mz = 0;
  if (tgt) {
    const dx = tgt.x - p.x, dz = tgt.z - p.z, l = Math.hypot(dx, dz) || 1;
    p.yaw = Math.atan2(-dx, -dz);
    const fwd = l > 12 ? 1 : l < 6 ? -1 : 0;
    if (p.strafe === undefined || Math.random() < 0.03) p.strafe = Math.random() < 0.5 ? -1 : 1;
    mx = dx / l * fwd - dz / l * p.strafe * 0.7; mz = dz / l * fwd + dx / l * p.strafe * 0.7;
  } else {
    if (!p.wp || Math.hypot(p.wp[0] - p.x, p.wp[1] - p.z) < 2 || Math.random() < 0.01) p.wp = [Math.random() * 52 - 26, Math.random() * 52 - 26];
    const dx = p.wp[0] - p.x, dz = p.wp[1] - p.z, l = Math.hypot(dx, dz) || 1;
    mx = dx / l; mz = dz / l; p.yaw = Math.atan2(-dx, -dz);
  }
  const ml = Math.hypot(mx, mz) || 1, sp = D.sp * dt;
  let blocked = false;
  const nx = p.x + mx / ml * sp, nz = p.z + mz / ml * sp;
  if (!collides(B, nx, p.y, p.z)) p.x = nx; else blocked = true;
  if (!collides(B, p.x, p.y, nz)) p.z = nz; else blocked = true;
  if (blocked) { p.wp = null; if (p.ground) p.vy = 9; }
  p.vy -= 25 * dt;
  const ny = p.y + p.vy * dt;
  if (collides(B, p.x, ny, p.z)) { if (p.vy < 0) p.ground = true; p.vy = 0; } else { p.y = ny; p.ground = false; }
  if (tgt && t > (p.botNext || 0)) {
    const a = [tgt.x - p.x, tgt.y + 1.0 - eye[1], tgt.z - p.z].map(v => v + (Math.random() - 0.5) * D.spread);
    shoot(r, p, { d: a });
    p.botNext = t + D.gap[0] + Math.random() * D.gap[1];
  }
}

wss.on('connection', ws => {
  let r = null, p = null, key = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join' && !p) {
      key = String(m.room).slice(0, 64);
      r = rooms.get(key) || rooms.set(key, { players: new Map(), timeLeft: MATCH, over: false, map: 0, botN: 0, diff: 1 }).get(key);
      if (r.players.size >= MAX) {
        const b = [...r.players.values()].find(q => q.bot);
        if (b) r.players.delete(b.id); else { send(ws, { t: 'full' }); return ws.close(); }
      }
      p = { ws, id: nextId++, name: String(m.name || 'Joueur').slice(0, 20), kills: 0, deaths: 0, lastShot: 0, deadAt: 0, hp: 0 };
      r.players.set(p.id, p);
      spawn(r, p);
      send(ws, { t: 'welcome', id: p.id, map: r.map });
      return;
    }
    if (!p) return;
    if (m.t === 'in') {
      if (p.hp <= 0 || r.over) return;
      const t = now(), dt = Math.min(t - p.last, 0.5); p.last = t;
      if (![m.x, m.y, m.z, m.yaw, m.pitch].every(Number.isFinite)) return;
      if (Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z) > 30 * dt + 0.8 || collides(bx(r), m.x, m.y + 0.05, m.z)) {
        return send(ws, { t: 'tp', x: p.x, y: p.y, z: p.z });
      }
      Object.assign(p, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch });
    } else if (m.t === 'shoot') shoot(r, p, m);
    else if (m.t === 'reload' && !p.reloading && p.hp > 0 && p.ammos[p.w] < WEAPONS[p.w].mag) startReload(p, now());
    else if (m.t === 'wp' && (m.w === 0 || m.w === 1) && p.hp > 0 && m.w !== p.w) { p.w = m.w; p.reloading = false; }
    else if (m.t === 'diff') { r.diff = (r.diff + 1) % DIFFS.length; bcast(r, { t: 'diffinfo', n: DIFFS[r.diff].n }); }
    else if (m.t === 'bot') {
      if (m.n > 0 && r.players.size < MAX) {
        const b = { ws: null, bot: true, id: nextId++, name: 'Bot ' + (++r.botN), kills: 0, deaths: 0, lastShot: 0, deadAt: 0, hp: 0 };
        r.players.set(b.id, b); spawn(r, b);
      } else if (m.n < 0) {
        const b = [...r.players.values()].reverse().find(q => q.bot);
        if (b) r.players.delete(b.id);
      }
    }
  });
  ws.on('close', () => {
    if (!r || !p) return;
    r.players.delete(p.id);
    if (!humans(r).length) rooms.delete(key);
  });
});

setInterval(() => {
  const t = now();
  for (const [key, r] of rooms) {
    if (!r.over && (r.timeLeft -= 0.05) <= 0) endMatch(r);
    for (const p of r.players.values()) {
      if (p.hp <= 0 && !r.over && t - p.deadAt >= RESPAWN) spawn(r, p);
      if (p.reloading && t >= p.reloadEnd) { p.reloading = false; p.ammos[p.w] = WEAPONS[p.w].mag; }
      if (p.bot) botThink(r, p, t);
    }
    const f = v => +v.toFixed(2);
    bcast(r, {
      t: 's', tl: Math.max(0, Math.round(r.timeLeft)),
      p: [...r.players.values()].map(p => [p.id, p.name, f(p.x), f(p.y), f(p.z), f(p.yaw), f(p.pitch), p.hp, p.kills, p.deaths, p.ammos[p.w], p.reloading ? 1 : 0, p.w]),
    });
  }
}, 50);

server.listen(PORT, () => console.log('Serveur sur le port', PORT));
