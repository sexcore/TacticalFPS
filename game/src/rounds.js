// Rounds: freeze / live / end phases, economy, bomb plant/defuse/pickup,
// fuse and win conditions, match reset. The only module that ends a round.
// Match: first to 7 wins early; else most rounds after 12; a tie is a draw.
import { CFG, WEAPONS, OBJECTIVE_NAME } from './config.js';
import { SITES, SPAWNS } from './map.js';
import { aliveOf, pushFeed, pushRadio, setBanner } from './state.js';
import { explodeAt } from './weapons.js';
import { resetBotForRound } from './bots.js';
import { dist2XZ } from './math.js';

export function siteAt(x, z) {
  const a = SITES.A;
  if (Math.abs(x - a.cx) <= a.hw && Math.abs(z - a.cz) <= a.hd) return 'A';
  const b = SITES.B;
  if (Math.abs(x - b.cx) <= b.hw && Math.abs(z - b.cz) <= b.hd) return 'B';
  return null;
}

function botLoadout(S, a) {
  const r = S.round;
  let primary = null;
  if (r >= 4 && a.bot && (a.bot.role === 'push' || a.bot.role === 'push2')) primary = 'lr88';
  else if (r >= 3) primary = 'ar4';
  else if (r >= 2) primary = 'k7';
  a.primary = primary;
  a.secondary = 'p9';
  a.weapon = primary || 'p9';
  for (const id of Object.keys(WEAPONS)) {
    a.mag[id] = WEAPONS[id].mag;
    a.reserve[id] = WEAPONS[id].reserve;
  }
  a.nade.frag = r >= 2 ? 1 : 0;
  a.nade.flash = 0;
  a.nade.smoke = 0;
  a.armor = r >= 3 ? 100 : 0;
  a.hasKit = a.team === 'G' && r >= 3;
}

export function startRound(S, W) {
  S.phase = 'freeze';
  S.phaseT = CFG.freezeTime;
  S.matchOver = false;
  S.matchWinner = null;
  S.roundLine = '';
  const bomb = S.bomb;
  bomb.state = 'carried';
  bomb.site = Math.random() < 0.5 ? 'A' : 'B';
  bomb.plantT = 0;
  bomb.defuseT = 0;
  bomb.fuse = 0;
  bomb.beepT = 0;
  let gIdx = 0, sIdx = 0;
  let carrier = null;
  for (const a of S.agents) {
    const survived = a.alive;
    const idx = a.team === 'G' ? gIdx++ : sIdx++;
    const sp = SPAWNS[a.team][idx % SPAWNS[a.team].length];
    a.pos.set(sp[0], 0, sp[1]);
    a.vel.set(0, 0, 0);
    a.yaw = a.team === 'G' ? 0 : Math.PI;
    a.pitch = 0;
    a.hp = 100;
    a.alive = true;
    a.channel = null;
    a.bombCarrier = false;
    a.reloadT = 0; a.fireT = 0; a.bloom = 0; a.recoilP = 0; a.recoilY = 0;
    a.crouch = false; a.hurtT = 0; a.deadT = 0; a.lastAttacker = null; a.onGround = true;
    a.blindT = 0; a.intelT = -99; a.assistCand = null;
    if (a.isPlayer) {
      if (!survived) {
        a.primary = null; a.secondary = 'p9'; a.weapon = 'p9';
        a.nade.frag = 0; a.nade.flash = 0; a.nade.smoke = 0;
        a.armor = 0; a.hasKit = false;
        a.mag.p9 = WEAPONS.p9.mag; a.reserve.p9 = WEAPONS.p9.reserve;
      } else {
        for (const id of [a.primary, a.secondary]) {
          if (!id) continue;
          const w = WEAPONS[id];
          const take = Math.min(w.mag - a.mag[id], a.reserve[id]);
          a.mag[id] += take;
          a.reserve[id] -= take;
        }
      }
    } else {
      botLoadout(S, a);
      resetBotForRound(a);
    }
    if (a.team === 'S' && !carrier) carrier = a;
  }
  bomb.carrier = carrier;
  if (carrier) carrier.bombCarrier = true;
  for (const g of S.grenades) g.active = false;
  for (const s of S.smokes) s.active = false;
  if (W.fx.clearSmoke) W.fx.clearSmoke();
  S.noises.length = 0;
  S.radio.length = 0;
  S.shake = 0; S.hitmark = 0; S.damageFlash = 0; S.flashT = 0;
  setBanner(S, 'ROUND ' + S.round, 'Guard ' + S.score.G + ' — ' + S.score.S + ' Strike');
  W.audio.play('round', null);
}

export function resetMatch(S) {
  S.score.G = 0; S.score.S = 0;
  S.losses.G = 0; S.losses.S = 0;
  S.round = 1;
  S.matchOver = false;
  S.matchWinner = null;
  S.roundLine = '';
  S.stats.shots = 0; S.stats.hits = 0; S.stats.headshots = 0;
  for (const a of S.agents) {
    a.money = CFG.startMoney;
    a.kills = 0; a.deaths = 0; a.assists = 0; a.damage = 0; a.hsKills = 0;
  }
}

function endRound(S, W, winner, reason) {
  S.phase = 'end';
  S.winners = winner;
  S.score[winner]++;
  const loser = winner === 'G' ? 'S' : 'G';
  S.losses[winner] = 0;
  S.losses[loser]++;
  for (const a of S.agents) {
    a.channel = null;
    if (!a.isPlayer) continue;
    const gain = a.team === winner
      ? CFG.winMoney
      : Math.min(CFG.lossCap, CFG.lossMoney + CFG.lossBonus * (S.losses[a.team] - 1));
    a.money = Math.min(CFG.maxMoney, a.money + gain);
  }
  const earlyWin = S.score[winner] >= CFG.matchWins;
  const lastRound = S.round >= CFG.maxRounds;
  S.matchOver = earlyWin || lastRound;
  if (S.matchOver) {
    S.matchWinner = earlyWin ? winner : (S.score.G === S.score.S ? 'draw' : (S.score.G > S.score.S ? 'G' : 'S'));
  }
  S.phaseT = S.matchOver ? CFG.matchEndTime : CFG.endTime;
  const scoreLine = 'Guard ' + S.score.G + ' — ' + S.score.S + ' Strike';
  let matchLine = '';
  if (S.matchOver) {
    matchLine = S.matchWinner === 'draw' ? 'MATCH DRAW' : (S.matchWinner === 'G' ? 'GUARD WINS THE MATCH' : 'STRIKE WINS THE MATCH');
  }
  S.roundLine = 'ROUND ' + S.round + ' — ' + reason + '  ·  ' + scoreLine;
  setBanner(S, reason, S.matchOver ? matchLine + '  ·  ' + scoreLine : scoreLine);
  pushFeed(S, reason, winner === 'G' ? 'g' : 's');
  W.audio.play(winner === 'G' ? 'win' : 'lose', null);
}

export function updateRounds(S, W, dt) {
  S.time += dt;
  S.tick++;
  let w = 0;
  for (let r = 0; r < S.noises.length; r++) {
    if (S.time - S.noises[r].t < 1.5) S.noises[w++] = S.noises[r];
  }
  S.noises.length = w;
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 1.6);
  if (S.hitmark > 0) S.hitmark -= dt;
  if (S.damageFlash > 0) S.damageFlash = Math.max(0, S.damageFlash - dt * 1.4);
  if (S.flashT > 0) S.flashT = Math.max(0, S.flashT - dt);

  if (S.phase === 'freeze') {
    S.phaseT -= dt;
    if (S.phaseT <= 0) {
      S.phase = 'live';
      S.phaseT = CFG.roundTime;
      setBanner(S, 'DEFEND THE SITES', '');
      W.audio.play('go', null);
    }
    return;
  }
  if (S.phase === 'end') {
    S.phaseT -= dt;
    if (S.phaseT <= 0) {
      if (S.matchOver) resetMatch(S);
      else S.round++;
      startRound(S, W);
    }
    return;
  }
  if (S.phase !== 'live') return;

  // Plant progress (resets on interruption)
  if (S.bomb.state === 'carried' && S.bomb.carrier && S.bomb.carrier.alive) {
    const c = S.bomb.carrier;
    const site = siteAt(c.pos.x, c.pos.z);
    const still = Math.hypot(c.vel.x, c.vel.z) < 0.5;
    if (site && c.channel && c.channel.kind === 'plant' && still) {
      S.bomb.plantT += dt;
      if (S.bomb.plantT >= CFG.plantTime) {
        S.bomb.state = 'planted';
        S.bomb.site = site;
        S.bomb.pos.set(c.pos.x, 0.15, c.pos.z);
        S.bomb.fuse = CFG.fuseTime;
        S.bomb.beepT = 0.6;
        S.bomb.carrier = null;
        c.bombCarrier = false;
        c.channel = null;
        setBanner(S, 'FURNACE CORE PLANTED — SITE ' + site, 'Defuse it before detonation');
        pushFeed(S, OBJECTIVE_NAME + ' planted at site ' + site, 's');
        for (const g of S.agents) {
          if (g.team === 'G' && g.alive && !g.isPlayer) {
            pushRadio(S, g.name + ': Core planted — Site ' + site + '!');
            break;
          }
        }
        W.audio.play('planted', null);
      }
    } else {
      S.bomb.plantT = 0;
    }
  }
  // Pickup of a dropped charge
  if (S.bomb.state === 'dropped') {
    for (const a of S.agents) {
      if (a.team === 'S' && a.alive && dist2XZ(a.pos.x, a.pos.z, S.bomb.pos.x, S.bomb.pos.z) < 1.44) {
        S.bomb.state = 'carried';
        S.bomb.carrier = a;
        a.bombCarrier = true;
        W.audio.play('pickup', a);
        pushFeed(S, a.name + ' recovered the ' + OBJECTIVE_NAME, 's');
        break;
      }
    }
  }
  // Defuse progress (persists across interruptions). A defuse kit halves it.
  if (S.bomb.state === 'planted') {
    let defuser = null;
    for (const a of S.agents) {
      if (a.team === 'G' && a.alive && a.channel && a.channel.kind === 'defuse'
        && dist2XZ(a.pos.x, a.pos.z, S.bomb.pos.x, S.bomb.pos.z) < 2.89
        && Math.hypot(a.vel.x, a.vel.z) < 0.5) {
        defuser = a;
        break;
      }
    }
    if (defuser) {
      S.bomb.defuseT += dt;
      const need = defuser.hasKit ? CFG.defuseTime / 2 : CFG.defuseTime;
      if (S.bomb.defuseT >= need) {
        S.bomb.state = 'defused';
        endRound(S, W, 'G', 'FURNACE CORE DEFUSED');
        return;
      }
    }
  }
  // Fuse and win conditions
  const gAlive = aliveOf(S, 'G');
  const sAlive = aliveOf(S, 'S');
  if (S.bomb.state === 'planted') {
    S.bomb.fuse -= dt;
    S.bomb.beepT -= dt;
    if (S.bomb.beepT <= 0) {
      W.audio.playAt('beep', S.bomb.pos, 0.9);
      const frac = 1 - S.bomb.fuse / CFG.fuseTime;
      S.bomb.beepT = 0.12 + (1 - frac) * 0.85;
    }
    if (S.bomb.fuse <= 0) {
      explodeAt(S, W, S.bomb.pos, 13, 230, null);
      S.bomb.state = 'exploded';
      endRound(S, W, 'S', 'FURNACE CORE DETONATED');
      return;
    }
    if (gAlive === 0) { endRound(S, W, 'S', 'DEFENDERS ELIMINATED'); return; }
  } else {
    if (sAlive === 0) { endRound(S, W, 'G', 'STRIKE TEAM ELIMINATED'); return; }
    if (gAlive === 0) { endRound(S, W, 'S', 'GUARD ELIMINATED'); return; }
    S.phaseT -= dt;
    if (S.phaseT <= 0) { endRound(S, W, 'G', 'TIME EXPIRED — SITES HELD'); return; }
  }
}
