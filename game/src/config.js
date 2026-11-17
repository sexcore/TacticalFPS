// FOUNDRY — tuning, weapons, economy, palette. One place for every number.
// All distances in metres, all times in seconds, all money in dollars.
export const CFG = {
  simDt: 1 / 60,
  gravity: 15.5,
  jumpVel: 5.6,
  walkSpeed: 4.4,
  crouchSpeed: 2.3,
  accelGround: 42,
  accelAir: 9,
  friction: 11,
  eyeStand: 1.62,
  eyeCrouch: 1.12,
  bodyHalf: 0.34,
  bodyHeight: 1.78,
  bodyCrouch: 1.28,
  headSize: 0.46,
  freezeTime: 6,
  roundTime: 100,
  fuseTime: 40,
  plantTime: 4,
  defuseTime: 5,
  endTime: 4,
  matchEndTime: 8, // longer end phase when the match ends, so the scoreboard reads
  matchWins: 7, // first to 7 wins early (v2: 5v5, 12-round matches)
  maxRounds: 12, // else most rounds after 12; a tie is a draw
  startMoney: 800,
  killMoney: 300,
  winMoney: 3250,
  lossMoney: 1400,
  lossBonus: 500,
  lossCap: 3400,
  maxMoney: 16000,
  bombBeepStart: 1.0,
  hearShot: 26,
  hearStep: 7,
};

// Weapon table. spread: degrees. recoil: degrees of pitch kick per shot.
export const WEAPONS = {
  p9: { name: 'P9 Sidearm', price: 0, slot: 2, damage: 26, headMult: 3, rpm: 352, mag: 12, reserve: 48, reload: 1.5, auto: false, range: 46, falloff: 0.55, spreadBase: 0.35, spreadMove: 2.6, spreadAir: 4.5, bloom: 0.55, bloomMax: 3.2, recoilPitch: 0.55, recoilYaw: 0.22, pellets: 1, zoom: 0 },
  k7: { name: 'K7 SMG', price: 1500, slot: 1, damage: 22, headMult: 3, rpm: 750, mag: 30, reserve: 90, reload: 2.1, auto: true, range: 38, falloff: 0.5, spreadBase: 0.8, spreadMove: 3.4, spreadAir: 5.5, bloom: 0.42, bloomMax: 4.6, recoilPitch: 0.42, recoilYaw: 0.3, pellets: 1, zoom: 0 },
  ar4: { name: 'AR-4 Rifle', price: 2700, slot: 1, damage: 30, headMult: 3.2, rpm: 600, mag: 30, reserve: 90, reload: 2.4, auto: true, range: 60, falloff: 0.7, spreadBase: 0.45, spreadMove: 3.0, spreadAir: 5.0, bloom: 0.5, bloomMax: 4.2, recoilPitch: 0.62, recoilYaw: 0.26, pellets: 1, zoom: 0 },
  lr88: { name: 'LR-88 Marksman', price: 4750, slot: 1, damage: 96, headMult: 2, rpm: 55, mag: 5, reserve: 15, reload: 3.2, auto: false, range: 90, falloff: 0.9, spreadBase: 0.05, spreadMove: 6.0, spreadAir: 8.0, bloom: 2.4, bloomMax: 5.0, recoilPitch: 2.6, recoilYaw: 0.4, pellets: 1, zoom: 2.6 },
};

// The objective's name, used in every user-facing string (HUD, banners,
// feed, README). Internal identifiers still say bomb/charge.
export const OBJECTIVE_NAME = 'Furnace Core';

export const GRENADES = {
  frag: { name: 'Frag Charge', price: 300, fuse: 2.4, radius: 7.5, damage: 110, throwSpeed: 15, upSpeed: 4.5, bounce: 0.42, maxCarry: 2 },
  flash: { name: 'Flash Charge', price: 200, fuse: 1.6, radius: 18, blindTime: 2.2, throwSpeed: 15, upSpeed: 4.5, bounce: 0.42, maxCarry: 2 },
  smoke: { name: 'Smoke Charge', price: 250, fuse: 1.2, radius: 4.5, duration: 12, throwSpeed: 15, upSpeed: 4.5, bounce: 0.42, maxCarry: 2 },
};
export const ARMOR_PRICE = 650;
export const KIT_PRICE = 400; // defuse kit, Guard only: defuse in half the time

// Palette: dusk foundry — slate sky, warm lamps, rust, teal accents.
// v2 brightened for readability (exposure/lights lifted in main.js too);
// the amber/teal site landmark colors are unchanged.
export const PALETTE = {
  sky: 0x35465a, fog: 0x35465a, ground: 0x7a7166, concrete: 0x8a857c, dark: 0x554f47,
  rust: 0x9a4a28, rustDark: 0x6e3319, metal: 0x5d6a72, teal: 0x2e8b8b, amber: 0xd98a2b,
  crate: 0x7a5c38, guard: 0x3a97d8, strike: 0xe8641f, lamp: 0xffc06a, white: 0xe8e4da,
};

export const TEAM = { GUARD: 'G', STRIKE: 'S' };
export const TEAM_NAME = { G: 'Guard', S: 'Strike' };
