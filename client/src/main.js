import * as THREE from 'three';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { MAPS, WEAPONS, SPEED, collides } from '../../shared/map.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const inDiscord = params.has('frame_id');
const GRAV = 25, JUMP = 9;

async function identify() {
  if (!inDiscord) return { room: params.get('room') || 'dev', name: 'Joueur' + Math.floor(Math.random() * 999) };
  const id = import.meta.env.VITE_DISCORD_CLIENT_ID;
  const sdk = new DiscordSDK(id);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({ client_id: id, response_type: 'code', state: '', prompt: 'none', scope: ['identify'] });
  const r = await fetch('/.proxy/api/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  const { access_token } = await r.json();
  const auth = await sdk.commands.authenticate({ access_token });
  return { room: sdk.instanceId, name: auth.user.global_name || auth.user.username };
}

// ---------- Scène ----------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87ceeb, 30, 90);
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(20, 40, 10); scene.add(sun);
const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
gun.position.set(0.22, -0.2, -0.45); camera.add(gun);

let mapGroup = null, mapIdx = -1, curBoxes = MAPS[0].boxes;
function buildMap(i) {
  if (i === mapIdx) return;
  mapIdx = i; const M = MAPS[i]; curBoxes = M.boxes;
  if (mapGroup) scene.remove(mapGroup);
  mapGroup = new THREE.Group();
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(62, 62), new THREE.MeshLambertMaterial({ color: M.floor }));
  fl.rotation.x = -Math.PI / 2; mapGroup.add(fl);
  for (const b of M.boxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), new THREE.MeshLambertMaterial({ color: b.c }));
    m.position.set(b.x, b.y, b.z); mapGroup.add(m);
  }
  scene.add(mapGroup);
  scene.background = new THREE.Color(M.sky); scene.fog.color.set(M.sky);
}
buildMap(0);

// ---------- État ----------
const me = { x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, onGround: false };
let myId = 0, hp = 100, ammo = 20, reloading = 0, ws, locked = false, mouseDown = false, rightDown = false, click = false;
let deadUntil = 0, deadBy = '', over = false, lastDmgHp = 100, curW = 0, lastSwitch = 0, stepAcc = 0;
const keys = {}, remotes = new Map(), tracers = [];

// ---------- Sons ----------
let ac, noise;
function audio() {
  ac ??= new AudioContext();
  if (!noise) { const b = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noise = b; }
  return ac;
}
function tone(f, d, g = 0.05, type = 'square') {
  try {
    const c = audio(), o = c.createOscillator(), gn = c.createGain();
    o.type = type; o.frequency.value = f; gn.gain.setValueAtTime(g, c.currentTime); gn.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d);
    o.connect(gn); gn.connect(c.destination); o.start(); o.stop(c.currentTime + d);
  } catch {}
}
function puff(g, dur, freq) {
  try {
    const c = audio(), s = c.createBufferSource(), f = c.createBiquadFilter(), gn = c.createGain();
    s.buffer = noise; f.type = 'lowpass'; f.frequency.value = freq;
    gn.gain.setValueAtTime(g, c.currentTime); gn.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(f); f.connect(gn); gn.connect(c.destination); s.start(); s.stop(c.currentTime + dur);
  } catch {}
}
const step = v => puff(0.35 * v, 0.07, 500);
const shotSound = (w, v) => { if (w === 1) { puff(0.9 * v, 0.45, 1200); tone(70, 0.3, 0.08 * v, 'sawtooth'); } else { puff(0.5 * v, 0.12, 3500); tone(160, 0.08, 0.04 * v); } };

// ---------- Joueurs distants ----------
function tag(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = '#000'; g.fillStyle = '#fff';
  g.strokeText(name, 128, 44); g.fillText(name, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(2, 0.5, 1); s.position.y = 2.2; return s;
}
function makeRemote(id, name) {
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL((id * 0.37) % 1, 0.7, 0.5) });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.4), mat); body.position.y = 0.85;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.3), mat); legs.position.y = 0.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0xffd9b3 })); head.position.y = 1.6;
  const gn = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 })); gn.position.set(0.3, 1.0, -0.4);
  g.add(body, legs, head, gn, tag(name)); scene.add(g);
  return { g, t: new THREE.Vector3(), yaw: 0, acc: 0 };
}

function applyGun() { gun.scale.set(1, 1, curW ? 1.8 : 1); gun.material.color.set(curW ? 0x111122 : 0x222222); }
function setWeapon(i) { if (i === curW) return; curW = i; lastSwitch = performance.now(); applyGun(); sendWs({ t: 'wp', w: i }); }

// ---------- Réseau ----------
function onMsg(m) {
  if (m.t === 'welcome') {
    myId = m.id; buildMap(m.map);
    $('msg').textContent = `Carte : ${MAPS[m.map].name}\nClique pour jouer\nZQSD · Espace · Clic = tir · Clic droit = viser\n1 / 2 = armes · R = recharger\nB / N = ajouter / retirer un bot\nV = difficulté des bots`;
  } else if (m.t === 'full') $('msg').textContent = 'Partie pleine (5 joueurs max)';
  else if (m.t === 'tp') Object.assign(me, { x: m.x, y: m.y, z: m.z, vy: 0 });
  else if (m.t === 's') onState(m);
  else if (m.t === 'dead') { deadUntil = performance.now() + m.secs * 1000; deadBy = m.by + (m.head ? ' 🎯' : ''); }
  else if (m.t === 'diffinfo') { const d = document.createElement('div'); d.textContent = 'Bots : ' + m.n; $('feed').appendChild(d); setTimeout(() => d.remove(), 4000); }
  else if (m.t === 'shot') {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(m.o[0], m.o[1] - 0.15, m.o[2]), new THREE.Vector3(...m.e)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: m.w ? 0xff5555 : 0xffee55 }));
    scene.add(line); tracers.push({ line, t: m.w ? 0.2 : 0.08 });
    const dist = Math.hypot(m.o[0] - me.x, m.o[1] - me.y - 1.6, m.o[2] - me.z);
    shotSound(m.w, m.id === myId ? 1 : 1 / (1 + dist * 0.08));
    if (m.id === myId) gun.position.z = -0.35;
  } else if (m.t === 'hit') { tone(m.head ? 1000 : 700, 0.08, 0.05); $('hit').style.opacity = 1; setTimeout(() => $('hit').style.opacity = 0, 120); }
  else if (m.t === 'kill') {
    const d = document.createElement('div'); d.textContent = `${m.k} ${m.head ? '🎯' : m.w ? '🔭' : '🔫'} ${m.v}`;
    $('feed').appendChild(d); setTimeout(() => d.remove(), 5000);
  } else if (m.t === 'end') {
    over = true; document.exitPointerLock(); $('msg').style.display = 'flex';
    $('msg').textContent = `🏆 ${m.winner} gagne !\n\n` + m.board.map(r => `${r[0]}  ${r[1]}/${r[2]}`).join('\n') + '\n\nNouvelle manche dans 7 s…';
  } else if (m.t === 'reset') { over = false; buildMap(m.map); $('msg').textContent = `Carte : ${MAPS[m.map].name}\nClique pour jouer`; }
}
function onState(m) {
  const seen = new Set(), rows = [];
  $('time').textContent = Math.floor(m.tl / 60) + ':' + String(m.tl % 60).padStart(2, '0');
  for (const [id, name, x, y, z, yaw, , h, k, d, a, rl, w] of m.p) {
    seen.add(id); rows.push([name, k, d, id]);
    if (id === myId) {
      hp = h; ammo = a; reloading = rl;
      if (w !== curW && performance.now() - lastSwitch > 400) { curW = w; applyGun(); }
      continue;
    }
    let r = remotes.get(id);
    if (!r) { r = makeRemote(id, name); r.g.position.set(x, y, z); remotes.set(id, r); }
    r.t.set(x, y, z); r.yaw = yaw; r.g.visible = h > 0;
  }
  for (const [id, r] of remotes) if (!seen.has(id)) { scene.remove(r.g); remotes.delete(id); }
  rows.sort((a, b) => b[1] - a[1]);
  $('board').innerHTML = rows.map(r => `<div style="${r[3] === myId ? 'color:#ffd54a' : ''}">${r[0].replace(/</g, '&lt;')} — ${r[1]} / ${r[2]}</div>`).join('');
  $('hp').textContent = '❤ ' + hp;
  $('ammo').textContent = reloading ? 'Rechargement…' : `${WEAPONS[curW].name} ${ammo}/${WEAPONS[curW].mag}`;
  if (hp < lastDmgHp && hp > 0) { $('dmg').style.opacity = 1; setTimeout(() => $('dmg').style.opacity = 0, 150); }
  lastDmgHp = hp;
}
const sendWs = o => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

// ---------- Contrôles ----------
$('msg').onclick = () => { if (myId && !over) renderer.domElement.requestPointerLock(); };
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  $('msg').style.display = locked ? 'none' : 'flex';
});
document.addEventListener('mousemove', e => {
  if (!locked) return;
  const k = 0.0022 * camera.fov / 80;
  me.yaw -= e.movementX * k;
  me.pitch = Math.max(-1.5, Math.min(1.5, me.pitch - e.movementY * k));
});
addEventListener('mousedown', e => { if (e.button === 0) { mouseDown = true; click = true; } if (e.button === 2) rightDown = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) rightDown = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => { if (locked) setWeapon((curW + 1) % WEAPONS.length); });
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') sendWs({ t: 'reload' });
  if (e.code === 'Digit1') setWeapon(0);
  if (e.code === 'Digit2') setWeapon(1);
  if (e.code === 'KeyB') sendWs({ t: 'bot', n: 1 });
  if (e.code === 'KeyN') sendWs({ t: 'bot', n: -1 });
  if (e.code === 'KeyV') sendWs({ t: 'diff' });
});
addEventListener('keyup', e => keys[e.code] = false);
// event.code = position physique : KeyW = Z sur AZERTY, KeyA = Q, Digit1 = touche « & ».

function physics(dt) {
  if (hp <= 0) return;
  const px = me.x, pz = me.z;
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  let dx = -Math.sin(me.yaw) * f + Math.cos(me.yaw) * s, dz = -Math.cos(me.yaw) * f - Math.sin(me.yaw) * s;
  const l = Math.hypot(dx, dz);
  if (l) { dx = dx / l * SPEED * dt; dz = dz / l * SPEED * dt; } else dx = dz = 0;
  if (!collides(curBoxes, me.x + dx, me.y, me.z)) me.x += dx;
  if (!collides(curBoxes, me.x, me.y, me.z + dz)) me.z += dz;
  if (keys.Space && me.onGround) me.vy = JUMP;
  me.vy -= GRAV * dt;
  const ny = me.y + me.vy * dt;
  if (collides(curBoxes, me.x, ny, me.z)) { if (me.vy < 0) me.onGround = true; me.vy = 0; }
  else { me.y = ny; me.onGround = false; }
  if (me.onGround) { stepAcc += Math.hypot(me.x - px, me.z - pz); if (stepAcc > 3) { stepAcc = 0; step(1); } }
}

let lastShoot = 0;
const dir = new THREE.Vector3();
function loop(t0) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t0 - (loop.l || t0)) / 1000); loop.l = t0;
  if (locked && !over) physics(dt);
  const dead = hp <= 0 && !over;
  $('dead').style.display = dead ? 'flex' : 'none';
  if (dead) $('dead').textContent = `💀 Éliminé par ${deadBy}\n\nRéapparition dans ${Math.max(1, Math.ceil((deadUntil - t0) / 1000))} s`;
  const zoomed = locked && rightDown && curW === 1;
  const tf = zoomed ? 20 : 80;
  if (Math.abs(camera.fov - tf) > 0.1) { camera.fov += (tf - camera.fov) * Math.min(1, dt * 18); camera.updateProjectionMatrix(); }
  gun.visible = !zoomed; $('scope').style.display = zoomed && camera.fov < 40 ? 'block' : 'none';
  camera.position.set(me.x, me.y + (hp > 0 ? 1.6 : 0.4), me.z);
  camera.rotation.set(me.pitch, me.yaw, 0);
  gun.position.z += (-0.45 - gun.position.z) * Math.min(1, dt * 15);
  const W = WEAPONS[curW];
  if (locked && hp > 0 && !over && (W.auto ? mouseDown : click) && t0 - lastShoot > W.fire * 1000) {
    lastShoot = t0; camera.getWorldDirection(dir); sendWs({ t: 'shoot', d: [dir.x, dir.y, dir.z] });
  }
  click = false;
  const k = 1 - Math.exp(-15 * dt);
  for (const r of remotes.values()) {
    const bx = r.g.position.x, bz = r.g.position.z;
    r.g.position.lerp(r.t, k); r.g.rotation.y = r.yaw;
    if (r.g.visible) {
      r.acc += Math.hypot(r.g.position.x - bx, r.g.position.z - bz);
      if (r.acc > 3) { r.acc = 0; const d = Math.hypot(r.g.position.x - me.x, r.g.position.z - me.z); if (d < 35) step(1 / (1 + d * 0.3)); }
    }
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    if ((tracers[i].t -= dt) <= 0) { scene.remove(tracers[i].line); tracers.splice(i, 1); }
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

setInterval(() => { if (myId && locked && hp > 0) sendWs({ t: 'in', x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch }); }, 33);

(async () => {
  try {
    const { room, name } = await identify();
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${inDiscord ? '/.proxy' : ''}/ws`);
    ws.onopen = () => sendWs({ t: 'join', room, name });
    ws.onmessage = e => onMsg(JSON.parse(e.data));
    ws.onclose = () => { $('msg').style.display = 'flex'; $('msg').textContent = 'Connexion perdue'; document.exitPointerLock(); };
  } catch (e) { $('msg').textContent = 'Erreur : ' + e.message; }
})();
