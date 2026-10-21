// Données partagées client/serveur : constantes, armes, cartes, collisions.
export const HALF = 0.4, HEIGHT = 1.8, SPEED = 11;
export const WEAPONS = [
  { name: 'Fusil', dmg: 25, head: 50, fire: 0.15, mag: 20, reload: 1.3, auto: true },
  { name: 'Sniper', dmg: 80, head: 200, fire: 1.2, mag: 5, reload: 2.2, auto: false },
];
const wall = (x, z, w, d) => ({ x, y: 3, z, w, h: 6, d, c: 0x4a5568 });
const W4 = [wall(0, -30.5, 62, 1), wall(0, 30.5, 62, 1), wall(-30.5, 0, 1, 62), wall(30.5, 0, 1, 62)];
const T = 0xe67e22, S = 0xd35400, C = 0xc9a66b, G = 0x8e9aaf, R = 0xb5483a, B = 0x3d6a9e;

export const MAPS = [
  {
    name: 'Arène', floor: 0x7ccf7c, sky: 0x87ceeb,
    spawns: [[-24, 0, -24], [24, 0, -24], [-24, 0, 24], [24, 0, 24], [0, 0, -24], [0, 0, 24], [-24, 0, 8], [24, 0, -8]],
    boxes: [...W4,
      { x: 0, y: 1, z: 0, w: 8, h: 2, d: 8, c: T },
      { x: 0, y: 0.6, z: 5.5, w: 4, h: 1.2, d: 3, c: S }, { x: 0, y: 0.6, z: -5.5, w: 4, h: 1.2, d: 3, c: S },
      { x: 5.5, y: 0.6, z: 0, w: 3, h: 1.2, d: 4, c: S }, { x: -5.5, y: 0.6, z: 0, w: 3, h: 1.2, d: 4, c: S },
      { x: -12, y: 1, z: -10, w: 3, h: 2, d: 3, c: C }, { x: 12, y: 1, z: 10, w: 3, h: 2, d: 3, c: C },
      { x: -14, y: 1, z: 12, w: 3, h: 2, d: 3, c: C }, { x: 14, y: 1, z: -12, w: 3, h: 2, d: 3, c: C },
      { x: -20, y: 2, z: 0, w: 2, h: 4, d: 8, c: G }, { x: 20, y: 2, z: 0, w: 2, h: 4, d: 8, c: G },
      { x: 0, y: 1.5, z: -16, w: 10, h: 3, d: 2, c: G }, { x: 0, y: 1.5, z: 16, w: 10, h: 3, d: 2, c: G },
      { x: -8, y: 0.6, z: -18, w: 2, h: 1.2, d: 2, c: C }, { x: 8, y: 0.6, z: 18, w: 2, h: 1.2, d: 2, c: C },
    ],
  },
  {
    name: 'Entrepôt', floor: 0x9a9aa6, sky: 0x6b7a8f,
    spawns: [[-26, 0, -26], [26, 0, -26], [-26, 0, 26], [26, 0, 26], [0, 0, -26], [0, 0, 26], [-26, 0, 0], [26, 0, 0]],
    boxes: [...W4,
      // conteneurs
      { x: -10, y: 1.25, z: -8, w: 8, h: 2.5, d: 3, c: R }, { x: 10, y: 1.25, z: 8, w: 8, h: 2.5, d: 3, c: R },
      { x: -10, y: 1.25, z: 8, w: 8, h: 2.5, d: 3, c: B }, { x: 10, y: 1.25, z: -8, w: 8, h: 2.5, d: 3, c: B },
      // murs centraux
      { x: 0, y: 1, z: -4, w: 2, h: 2, d: 6, c: G }, { x: 0, y: 1, z: 4, w: 2, h: 2, d: 6, c: G },
      // plateformes + marches (idéales pour le sniper)
      { x: -22, y: 1.2, z: 0, w: 6, h: 2.4, d: 8, c: T }, { x: -17.5, y: 0.6, z: 0, w: 3, h: 1.2, d: 4, c: S },
      { x: 22, y: 1.2, z: 0, w: 6, h: 2.4, d: 8, c: T }, { x: 17.5, y: 0.6, z: 0, w: 3, h: 1.2, d: 4, c: S },
      // piliers et murs bas
      { x: -14, y: 3, z: -18, w: 2, h: 6, d: 2, c: G }, { x: 14, y: 3, z: -18, w: 2, h: 6, d: 2, c: G },
      { x: -14, y: 3, z: 18, w: 2, h: 6, d: 2, c: G }, { x: 14, y: 3, z: 18, w: 2, h: 6, d: 2, c: G },
      { x: -8, y: 1.5, z: 20, w: 12, h: 3, d: 1, c: C }, { x: 8, y: 1.5, z: -20, w: 12, h: 3, d: 1, c: C },
    ],
  },
  {
    name: 'Cité', floor: 0x5a5f66, sky: 0xe0b080,
    spawns: [[-26, 0, -26], [26, 0, -26], [-26, 0, 26], [26, 0, 26], [0, 0, -27], [0, 0, 27], [-26, 0, 0], [26, 0, 0]],
    boxes: [...W4,
      // 4 immeubles avec escalier vers le toit (marches de 1,2 m)
      { x: -12, y: 1.8, z: -12, w: 10, h: 3.6, d: 10, c: 0x5b6b8c }, { x: -12, y: 1.2, z: -6, w: 3, h: 2.4, d: 2, c: S }, { x: -12, y: 0.6, z: -4, w: 3, h: 1.2, d: 2, c: S },
      { x: 12, y: 1.8, z: -12, w: 10, h: 3.6, d: 10, c: 0x7a5b8c }, { x: 12, y: 1.2, z: -6, w: 3, h: 2.4, d: 2, c: S }, { x: 12, y: 0.6, z: -4, w: 3, h: 1.2, d: 2, c: S },
      { x: -12, y: 1.8, z: 12, w: 10, h: 3.6, d: 10, c: 0x8c5b5b }, { x: -12, y: 1.2, z: 6, w: 3, h: 2.4, d: 2, c: S }, { x: -12, y: 0.6, z: 4, w: 3, h: 1.2, d: 2, c: S },
      { x: 12, y: 1.8, z: 12, w: 10, h: 3.6, d: 10, c: 0x5b8c6b }, { x: 12, y: 1.2, z: 6, w: 3, h: 2.4, d: 2, c: S }, { x: 12, y: 0.6, z: 4, w: 3, h: 1.2, d: 2, c: S },
      // fontaine et couvertures
      { x: 0, y: 0.5, z: 0, w: 6, h: 1, d: 6, c: 0x9fb4c8 },
      { x: 0, y: 1, z: -12, w: 6, h: 2, d: 1, c: C }, { x: 0, y: 1, z: 12, w: 6, h: 2, d: 1, c: C },
      { x: -24, y: 1, z: 0, w: 1, h: 2, d: 8, c: G }, { x: 24, y: 1, z: 0, w: 1, h: 2, d: 8, c: G },
      { x: 0, y: 0.75, z: -22, w: 4, h: 1.5, d: 2, c: R }, { x: 0, y: 0.75, z: 22, w: 4, h: 1.5, d: 2, c: B },
    ],
  },
];

export function collides(boxes, x, y, z) {
  if (y < 0) return true;
  for (const b of boxes)
    if (Math.abs(x - b.x) < b.w / 2 + HALF && Math.abs(z - b.z) < b.d / 2 + HALF && y < b.y + b.h / 2 && y + HEIGHT > b.y - b.h / 2) return true;
  return false;
}
