// HUD: cached DOM writes (textContent only on change), killfeed, banners,
// crosshair, buy menu, overlays, minimap, radio callouts, match scoreboard.
// Reads state; never writes gameplay truth except through the buy functions.
import { CFG, WEAPONS, GRENADES, ARMOR_PRICE, KIT_PRICE, OBJECTIVE_NAME } from './config.js';
import { buyWeapon, buyArmor, buyGrenade, buyKit } from './weapons.js';
import { BOXES, SITES, areaAt } from './map.js';
import { angleDiff, clamp, dist2XZ } from './math.js';

function statLine(id) {
  const w = WEAPONS[id];
  return w.damage + ' dmg · ×' + w.headMult + ' head · ' + w.rpm + ' rpm · ' + w.mag + '/' + w.reserve;
}

const BUY_ITEMS = [
  { id: 'k7', key: '1', label: 'K7 SMG', price: WEAPONS.k7.price, desc: statLine('k7') },
  { id: 'ar4', key: '2', label: 'AR-4 Rifle', price: WEAPONS.ar4.price, desc: statLine('ar4') },
  { id: 'lr88', key: '3', label: 'LR-88 Marksman', price: WEAPONS.lr88.price, desc: statLine('lr88') },
  { id: 'frag', key: '4', label: 'Frag Charge', price: GRENADES.frag.price, desc: '110 blast · 7.5m radius' },
  { id: 'armor', key: '5', label: 'Body Armor', price: ARMOR_PRICE, desc: 'Halves bullet damage' },
  { id: 'flash', key: '6', label: 'Flash Charge', price: GRENADES.flash.price, desc: 'Blinds up to 2.2s · 18m' },
  { id: 'smoke', key: '7', label: 'Smoke Charge', price: GRENADES.smoke.price, desc: 'Blocks sight · 12s' },
  { id: 'kit', key: '8', label: 'Defuse Kit', price: KIT_PRICE, desc: 'Defuse 2.5s, not 5s · Guard' },
];

export function tryBuy(S, W, id) {
  const p = S.player;
  if (!p || !p.alive || S.phase !== 'freeze') return false;
  if (id === 'frag' || id === 'flash' || id === 'smoke') return buyGrenade(S, W, p, id);
  if (id === 'armor') return buyArmor(S, W, p);
  if (id === 'kit') return buyKit(S, W, p);
  return buyWeapon(S, W, p, id);
}

function fmtTime(t) {
  const s = Math.max(0, Math.ceil(t));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Minimap: world [-34, 34] maps onto a 168px canvas.
const MAP_PX = 168, MAP_SCALE = MAP_PX / 68, MAP_C = MAP_PX / 2;
function mapX(x) { return MAP_C + x * MAP_SCALE; }
function mapZ(z) { return MAP_C + z * MAP_SCALE; }

export class HUD {
  constructor(S, W, callbacks) {
    this.el = {};
    const ids = ['hp-num', 'hp-bar-fill', 'armor-row', 'armor-num', 'kit-row', 'ammo-mag', 'ammo-reserve',
      'weapon-name', 'grenade-pips', 'money', 'timer', 'score-g', 'score-s', 'round-label', 'round-line',
      'killfeed', 'banner', 'banner-text', 'banner-sub', 'crosshair', 'hitmarker', 'vignette', 'flash',
      'dmg-dir', 'channel', 'channel-fill', 'channel-label', 'bomb-status', 'buy-menu',
      'buy-rows', 'buy-money', 'start-overlay', 'death-overlay', 'death-sub', 'pause-overlay',
      'hint', 'scope', 'radio', 'map-location', 'match-board', 'board-title', 'board-score', 'board-rows'];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.cache = {};
    this.feedSig = '';
    this.radioSig = '';
    this.boardSig = '';
    this.lastBanner = null;
    this.buyOpen = false;
    this.buySig = '';
    this.W = W;
    for (const item of BUY_ITEMS) {
      const row = document.createElement('div');
      row.className = 'buy-row';
      row.dataset.id = item.id;
      const k = document.createElement('span'); k.className = 'buy-key'; k.textContent = item.key;
      const l = document.createElement('span'); l.className = 'buy-label'; l.textContent = item.label;
      const d = document.createElement('span'); d.className = 'buy-desc'; d.textContent = item.desc;
      const pr = document.createElement('span'); pr.className = 'buy-price'; pr.textContent = '$' + item.price;
      row.append(k, l, d, pr);
      row.addEventListener('click', () => { if (tryBuy(S, W, item.id)) this.refreshBuy(S); });
      this.el['buy-rows'].appendChild(row);
    }
    document.getElementById('start-btn').addEventListener('click', () => callbacks.onStart());
    document.getElementById('resume-btn').addEventListener('click', () => callbacks.onResume());
    this.initMinimap();
  }

  initMinimap() {
    const cv = document.getElementById('minimap');
    this.mapCtx = cv.getContext('2d');
    const bg = document.createElement('canvas');
    bg.width = bg.height = MAP_PX;
    const c = bg.getContext('2d');
    c.fillStyle = 'rgba(8, 12, 16, 0.72)';
    c.fillRect(0, 0, MAP_PX, MAP_PX);
    // Walls and cover from the real map geometry.
    for (const b of BOXES) {
      const w = b[3] * MAP_SCALE, h = b[4] * MAP_SCALE;
      c.fillStyle = b[5] > 2 ? 'rgba(190,184,172,0.6)' : 'rgba(140,134,122,0.45)';
      c.fillRect(mapX(b[0]) - w / 2, mapZ(b[2]) - h / 2, w, h);
    }
    // Site zones in their landmark colors.
    for (const key of Object.keys(SITES)) {
      const s = SITES[key];
      const css = '#' + s.accent.toString(16).padStart(6, '0');
      c.fillStyle = css + '33';
      c.fillRect(mapX(s.cx) - s.hw * MAP_SCALE, mapZ(s.cz) - s.hd * MAP_SCALE, s.hw * 2 * MAP_SCALE, s.hd * 2 * MAP_SCALE);
      c.strokeStyle = css;
      c.lineWidth = 1.5;
      c.strokeRect(mapX(s.cx) - s.hw * MAP_SCALE, mapZ(s.cz) - s.hd * MAP_SCALE, s.hw * 2 * MAP_SCALE, s.hd * 2 * MAP_SCALE);
      c.fillStyle = css;
      c.font = 'bold 13px sans-serif';
      c.textAlign = 'center';
      c.fillText(key, mapX(s.cx), mapZ(s.cz) - s.hd * MAP_SCALE - 4);
    }
    this.mapBg = bg;
  }

  drawMinimap(S) {
    const c = this.mapCtx;
    const p = S.player;
    c.drawImage(this.mapBg, 0, 0);
    // Smoke clouds read as grey discs.
    for (const s of S.smokes) {
      if (!s.active) continue;
      c.fillStyle = 'rgba(170,170,164,0.55)';
      c.beginPath();
      c.arc(mapX(s.x), mapZ(s.z), s.r * MAP_SCALE, 0, 7);
      c.fill();
    }
    // Planted/dropped objective marker (announced in the feed already).
    if (S.bomb.state === 'planted' || S.bomb.state === 'dropped') {
      const blink = S.bomb.state === 'planted' ? (Math.sin(S.time * 6) > 0 ? 1 : 0.35) : 0.8;
      c.fillStyle = 'rgba(255,80,64,' + blink + ')';
      c.beginPath();
      c.arc(mapX(S.bomb.pos.x), mapZ(S.bomb.pos.z), 4.5, 0, 7);
      c.fill();
    }
    for (const a of S.agents) {
      if (!a.alive) continue;
      if (a.isPlayer) continue;
      if (a.team === 'G') {
        c.fillStyle = '#4db2e8';
        c.beginPath();
        c.arc(mapX(a.pos.x), mapZ(a.pos.z), 3, 0, 7);
        c.fill();
      } else if (S.time - a.intelT < 3) {
        // Enemy dot only while recently seen or heard. Fades with age.
        const age = S.time - a.intelT;
        c.fillStyle = 'rgba(255,80,64,' + (1 - age / 3.5).toFixed(2) + ')';
        c.beginPath();
        c.arc(mapX(a.intelX), mapZ(a.intelZ), 3, 0, 7);
        c.fill();
      }
    }
    // Player arrow, rotated by yaw (yaw 0 faces map-up).
    if (p) {
      c.save();
      c.translate(mapX(p.pos.x), mapZ(p.pos.z));
      c.rotate(-p.yaw);
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(0, -6);
      c.lineTo(4, 5);
      c.lineTo(-4, 5);
      c.closePath();
      c.fill();
      c.restore();
      this.setText('map-location', areaAt(p.pos.x, p.pos.z));
    }
  }

  setText(key, value) {
    if (this.cache[key] !== value) {
      this.cache[key] = value;
      this.el[key].textContent = value;
    }
  }

  setVisible(key, visible) {
    const ckey = key + ':vis';
    if (this.cache[ckey] !== visible) {
      this.cache[ckey] = visible;
      this.el[key].classList.toggle('hidden', !visible);
    }
  }

  toggleBuy() { this.buyOpen = !this.buyOpen; }

  refreshBuy(S) {
    const p = S.player;
    if (!p) return;
    const sig = p.money + '|' + (p.primary || '') + '|' + p.nade.frag + p.nade.flash + p.nade.smoke + '|' + p.armor + '|' + p.hasKit;
    if (sig === this.buySig) return;
    this.buySig = sig;
    this.setText('buy-money', '$' + p.money);
    const rows = this.el['buy-rows'].children;
    for (let i = 0; i < rows.length; i++) {
      const item = BUY_ITEMS[i];
      let owned = false;
      if (item.id === 'frag' || item.id === 'flash' || item.id === 'smoke') owned = p.nade[item.id] >= GRENADES[item.id].maxCarry;
      else if (item.id === 'armor') owned = p.armor > 0;
      else if (item.id === 'kit') owned = p.hasKit;
      else owned = p.primary === item.id;
      rows[i].classList.toggle('cant', owned || p.money < item.price);
      rows[i].classList.toggle('owned', owned);
    }
  }

  setPaused(v) { this.setVisible('pause-overlay', v); }
  hideStart() { this.setVisible('start-overlay', false); }

  renderRadio(S) {
    let sig = '';
    for (const r of S.radio) sig += r.text + '|';
    if (sig === this.radioSig) return;
    this.radioSig = sig;
    const el = this.el.radio;
    el.textContent = '';
    for (let i = S.radio.length - 1; i >= 0; i--) {
      const r = S.radio[i];
      if (S.time - r.t > 5) continue;
      const d = document.createElement('div');
      d.className = 'radio-row';
      d.textContent = '▸ ' + r.text;
      el.appendChild(d);
    }
  }

  renderBoard(S) {
    const sig = S.matchWinner + '|' + S.score.G + '|' + S.score.S + '|' + S.round;
    if (sig === this.boardSig) return;
    this.boardSig = sig;
    const title = S.matchWinner === 'draw' ? 'MATCH DRAW'
      : (S.matchWinner === 'G' ? 'GUARD WINS THE MATCH' : 'STRIKE WINS THE MATCH');
    this.setText('board-title', title);
    this.setText('board-score', 'Guard ' + S.score.G + ' — ' + S.score.S + ' Strike  ·  ' + S.round + ' rounds');
    const rows = this.el['board-rows'];
    rows.textContent = '';
    for (const team of ['G', 'S']) {
      const head = document.createElement('div');
      head.className = 'board-team ' + (team === 'G' ? 'g' : 's');
      head.textContent = team === 'G' ? 'GUARD' : 'STRIKE';
      rows.appendChild(head);
      const members = S.agents.filter((a) => a.team === team).sort((x, y) => y.kills - x.kills);
      for (const a of members) {
        const row = document.createElement('div');
        row.className = 'board-row';
        const hs = a.kills > 0 ? Math.round((a.hsKills / a.kills) * 100) + '%' : '—';
        row.textContent = a.name + '  ·  ' + a.kills + ' K  ·  ' + a.assists + ' A  ·  ' + a.deaths + ' D  ·  HS ' + hs + '  ·  ' + Math.round(a.damage) + ' DMG  ·  $' + a.money;
        rows.appendChild(row);
      }
    }
  }

  update(S) {
    const p = S.player;
    if (!p) return;
    // Vitals
    this.setText('hp-num', String(Math.max(0, Math.ceil(p.hp))));
    const hpPct = clamp(p.hp, 0, 100);
    if (this.cache.hpPct !== hpPct) {
      this.cache.hpPct = hpPct;
      this.el['hp-bar-fill'].style.width = hpPct + '%';
      this.el['hp-bar-fill'].classList.toggle('low', hpPct <= 30);
    }
    this.setVisible('armor-row', p.armor > 0);
    if (p.armor > 0) this.setText('armor-num', String(Math.ceil(p.armor)));
    this.setVisible('kit-row', p.hasKit);
    // Weapon
    const w = WEAPONS[p.weapon];
    this.setText('weapon-name', w.name + (p.reloadT > 0 ? '  —  RELOADING' : ''));
    this.setText('ammo-mag', String(p.mag[p.weapon]));
    this.setText('ammo-reserve', String(p.reserve[p.weapon]));
    const nadeLine = ['frag', 'flash', 'smoke'].map((k) =>
      (p.nadeSel === k ? '▸' : '') + GRENADES[k].name.split(' ')[0].toUpperCase() + ' ' + p.nade[k] + '/' + GRENADES[k].maxCarry).join('  ·  ');
    this.setText('grenade-pips', nadeLine);
    this.setText('money', '$' + p.money);
    // Round state
    if (S.bomb.state === 'planted') this.setText('timer', 'CORE ' + fmtTime(S.bomb.fuse));
    else if (S.phase === 'freeze') this.setText('timer', 'BUY ' + fmtTime(S.phaseT));
    else if (S.phase === 'live') this.setText('timer', fmtTime(S.phaseT));
    else this.setText('timer', '—');
    this.el.timer.classList.toggle('danger', S.bomb.state === 'planted');
    this.setText('score-g', String(S.score.G));
    this.setText('score-s', String(S.score.S));
    this.setText('round-label', 'ROUND ' + S.round + ' OF ' + CFG.maxRounds + '  ·  FIRST TO ' + CFG.matchWins);
    this.setText('round-line', S.roundLine);
    this.setVisible('round-line', S.phase === 'end' && S.roundLine !== '');
    // Bomb status
    let bombText = '';
    if (S.bomb.state === 'planted') bombText = '⚠ ' + OBJECTIVE_NAME.toUpperCase() + ' AT SITE ' + S.bomb.site + ' — DEFUSE IT';
    else if (S.bomb.state === 'dropped') bombText = OBJECTIVE_NAME.toUpperCase() + ' DROPPED';
    this.setText('bomb-status', bombText);
    this.setVisible('bomb-status', bombText !== '');
    // Killfeed
    let sig = '';
    for (const f of S.feed) sig += f.text + '|';
    if (sig !== this.feedSig) {
      this.feedSig = sig;
      const kf = this.el.killfeed;
      kf.textContent = '';
      for (let i = S.feed.length - 1; i >= 0; i--) {
        const d = document.createElement('div');
        d.className = 'feed-row ' + S.feed[i].cls;
        d.textContent = S.feed[i].text;
        kf.appendChild(d);
      }
    }
    // Radio callouts
    this.renderRadio(S);
    // Minimap
    this.drawMinimap(S);
    // Banner (never during the menu — it would sit behind the title)
    const showBanner = S.phase !== 'menu' && S.banner && (S.time - S.banner.t < 3.4);
    this.setVisible('banner', !!showBanner);
    if (showBanner && this.lastBanner !== S.banner) {
      this.lastBanner = S.banner;
      this.setText('banner-text', S.banner.text);
      this.setText('banner-sub', S.banner.sub);
    }
    // Crosshair gap grows with spread
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const moveF = clamp(speed / CFG.walkSpeed, 0, 1);
    let gap = 7 + p.bloom * 2.5 + moveF * 7 + (p.onGround ? 0 : 6) - (p.crouch ? 2 : 0);
    if (p.zoomed) gap = 2;
    gap = Math.round(clamp(gap, 2, 26));
    if (this.cache.gap !== gap) {
      this.cache.gap = gap;
      this.el.crosshair.style.setProperty('--gap', gap + 'px');
    }
    this.setVisible('crosshair', p.alive && !p.zoomed);
    this.setVisible('scope', !!p.zoomed && p.alive);
    // Hitmarker
    this.setVisible('hitmarker', S.hitmark > 0);
    this.el.hitmarker.classList.toggle('head', !!S.hitHead);
    // Damage feedback
    const vig = Math.round(S.damageFlash * 100) / 100;
    if (this.cache.vig !== vig) {
      this.cache.vig = vig;
      this.el.vignette.style.opacity = String(vig);
    }
    const showDir = S.damageFlash > 0.15;
    this.setVisible('dmg-dir', showDir);
    if (showDir) {
      const rot = Math.round(-angleDiff(S.damageDir, p.yaw) * 180 / Math.PI);
      if (this.cache.dmgRot !== rot) {
        this.cache.dmgRot = rot;
        this.el['dmg-dir'].style.transform = 'translate(-50%,-50%) rotate(' + rot + 'deg)';
      }
    }
    // Flash blindness overlay
    const fl = Math.round(clamp(S.flashT / 2.2, 0, 1) * 100) / 100;
    if (this.cache.flash !== fl) {
      this.cache.flash = fl;
      this.el.flash.style.opacity = String(fl);
    }
    // Channel bar
    const showChannel = !!(p.channel && p.alive);
    this.setVisible('channel', showChannel);
    if (showChannel) {
      const isDef = p.channel.kind === 'defuse';
      const need = isDef ? (p.hasKit ? CFG.defuseTime / 2 : CFG.defuseTime) : CFG.plantTime;
      const frac = isDef ? S.bomb.defuseT / need : S.bomb.plantT / need;
      const pct = Math.round(clamp(frac, 0, 1) * 100);
      if (this.cache.chanPct !== pct) {
        this.cache.chanPct = pct;
        this.el['channel-fill'].style.width = pct + '%';
      }
      this.setText('channel-label', isDef ? 'DEFUSING…' : 'PLANTING…');
    }
    // Hint line
    let hint = '';
    if (S.phase === 'freeze' && p.alive) hint = 'B — BUY MENU  ·  BUY BEFORE THE ROUND STARTS';
    else if (S.bomb.state === 'planted' && p.alive
      && dist2XZ(p.pos.x, p.pos.z, S.bomb.pos.x, S.bomb.pos.z) < 2.89) hint = 'HOLD E — DEFUSE THE ' + OBJECTIVE_NAME.toUpperCase();
    this.setText('hint', hint);
    // Buy menu
    const showBuy = this.buyOpen && S.phase === 'freeze' && p.alive;
    this.setVisible('buy-menu', showBuy);
    if (showBuy) this.refreshBuy(S);
    else this.buySig = '';
    // Match-end scoreboard
    const showBoard = S.matchOver && S.phase === 'end';
    this.setVisible('match-board', showBoard);
    if (showBoard) this.renderBoard(S);
    else this.boardSig = '';
    // Death overlay
    const showDeath = S.started && !p.alive && S.phase === 'live';
    this.setVisible('death-overlay', showDeath);
    if (showDeath) this.setText('death-sub', 'You will rejoin next round  ·  Spectating a teammate');
  }
}
