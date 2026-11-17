// The single game state. Every module reads and writes this one object;
// nothing else holds gameplay truth. Rendering mirrors it, never the reverse.
import * as THREE from 'three';
import { CFG, WEAPONS, TEAM } from './config.js';

let nextId = 1;

export function makeAgent(team, name, isPlayer) {
  const a = {
    id: nextId++, name, team, isPlayer,
    alive: true, hp: 100, armor: 0,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    yaw: 0, pitch: 0, crouch: false, onGround: true,
    weapon: 'p9', primary: null, secondary: 'p9',
    mag: {}, reserve: {},
    nade: { frag: 0, flash: 0, smoke: 0 }, nadeSel: 'frag',
    hasKit: false, blindT: 0,
    intelT: -99, intelX: 0, intelZ: 0, // last time/place the Guard team saw or heard this agent
    reloadT: 0, fireT: 0, bloom: 0, recoilP: 0, recoilY: 0,
    kills: 0, deaths: 0, assists: 0, damage: 0, hsKills: 0,
    assistCand: null, assistT: -99, // last other attacker, for assist credit
    money: CFG.startMoney,
    bot: null, mesh: null, parts: null,
    deadT: 0, hurtT: 0, stepT: 0, bombCarrier: false,
    channel: null, // {kind:'plant'|'defuse', t, dur}
    lastAttacker: null, spectate: 0,
  };
  for (const id of Object.keys(WEAPONS)) { a.mag[id] = WEAPONS[id].mag; a.reserve[id] = WEAPONS[id].reserve; }
  return a;
}

export function createState() {
  return {
    time: 0, tick: 0,
    phase: 'menu', // menu | freeze | live | end
    phaseT: 0,
    round: 1,
    score: { G: 0, S: 0 },
    losses: { G: 0, S: 0 },
    agents: [],
    player: null,
    bomb: {
      state: 'carried', // carried | dropped | planted | exploded | defused
      carrier: null, site: null,
      pos: new THREE.Vector3(), fuse: 0, beepT: 0,
      plantT: 0, defuseT: 0,
    },
    grenades: [],
    smokes: [], // active smoke clouds {x,y,z,r,t} — block bot vision + player sight
    noises: [],
    feed: [],
    radio: [], // teammate callouts {text, t}; text only
    radioT: -99, // last callout time, throttles the radio line
    roundLine: '',
    banner: null,
    shake: 0, hitmark: 0, hitHead: false, damageFlash: 0, damageDir: 0, flashT: 0,
    started: false, paused: false, matchOver: false, matchWinner: null,
    stats: { shots: 0, hits: 0, headshots: 0 },
    winners: TEAM.GUARD,
  };
}

export function aliveOf(S, team) {
  let n = 0;
  for (const a of S.agents) if (a.alive && a.team === team) n++;
  return n;
}

export function pushFeed(S, text, cls) {
  S.feed.push({ text, cls: cls || '', t: S.time });
  if (S.feed.length > 6) S.feed.shift();
}

/** Teammate callout. Throttled globally so the radio never floods. */
export function pushRadio(S, text) {
  if (S.time - S.radioT < 1.2) return;
  S.radioT = S.time;
  S.radio.push({ text, t: S.time });
  if (S.radio.length > 4) S.radio.shift();
}

export function setBanner(S, text, sub) {
  S.banner = { text, sub: sub || '', t: S.time };
}
