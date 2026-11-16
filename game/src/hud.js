// HUD: cached DOM writes (textContent only on change), killfeed, banners,
// crosshair, buy menu, overlays. Reads state; never writes gameplay truth
// except through the buy functions.
import { CFG, WEAPONS, GRENADE } from './config.js';
import { buyWeapon, buyArmor, buyGrenade } from './weapons.js';
import { angleDiff, clamp, dist2XZ } from './math.js';

const BUY_ITEMS = [
  { id: 'k7', key: '1', label: 'K7 SMG', price: 1500, desc: 'Fast, close range' },
  { id: 'ar4', key: '2', label: 'AR-4 Rifle', price: 2700, desc: 'Accurate, all-round' },
  { id: 'lr88', key: '3', label: 'LR-88 Marksman', price: 4750, desc: 'Scoped, huge damage' },
  { id: 'grenade', key: '4', label: 'Frag Charge', price: 300, desc: 'Bouncing explosive' },
  { id: 'armor', key: '5', label: 'Body Armor', price: 650, desc: 'Halves bullet damage' },
];

export function tryBuy(S, W, id) {
  const p = S.player;
  if (!p || !p.alive || S.phase !== 'freeze') return false;
  if (id === 'grenade') return buyGrenade(S, W, p);
  if (id === 'armor') return buyArmor(S, W, p);
  return buyWeapon(S, W, p, id);
}

function fmtTime(t) {
  const s = Math.max(0, Math.ceil(t));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export class HUD {
  constructor(S, W, callbacks) {
    this.el = {};
    const ids = ['hp-num', 'hp-bar-fill', 'armor-row', 'armor-num', 'ammo-mag', 'ammo-reserve',
      'weapon-name', 'grenade-pips', 'money', 'timer', 'score-g', 'score-s', 'round-label',
      'killfeed', 'banner', 'banner-text', 'banner-sub', 'crosshair', 'hitmarker', 'vignette',
      'dmg-dir', 'channel', 'channel-fill', 'channel-label', 'bomb-status', 'buy-menu',
      'buy-rows', 'buy-money', 'start-overlay', 'death-overlay', 'death-sub', 'pause-overlay',
      'hint', 'scope'];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.cache = {};
    this.feedSig = '';
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
    const sig = p.money + '|' + (p.primary || '') + '|' + p.grenades + '|' + p.armor;
    if (sig === this.buySig) return;
    this.buySig = sig;
    this.setText('buy-money', '$' + p.money);
    const rows = this.el['buy-rows'].children;
    for (let i = 0; i < rows.length; i++) {
      const item = BUY_ITEMS[i];
      let owned = false;
      if (item.id === 'grenade') owned = p.grenades >= GRENADE.maxCarry;
      else if (item.id === 'armor') owned = p.armor > 0;
      else owned = p.primary === item.id;
      rows[i].classList.toggle('cant', owned || p.money < item.price);
      rows[i].classList.toggle('owned', owned);
    }
  }

  setPaused(v) { this.setVisible('pause-overlay', v); }
  hideStart() { this.setVisible('start-overlay', false); }

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
    // Weapon
    const w = WEAPONS[p.weapon];
    this.setText('weapon-name', w.name + (p.reloadT > 0 ? '  —  RELOADING' : ''));
    this.setText('ammo-mag', String(p.mag[p.weapon]));
    this.setText('ammo-reserve', String(p.reserve[p.weapon]));
    this.setText('grenade-pips', '◆'.repeat(p.grenades) + '◇'.repeat(Math.max(0, GRENADE.maxCarry - p.grenades)));
    this.setText('money', '$' + p.money);
    // Round state
    if (S.bomb.state === 'planted') this.setText('timer', 'CHARGE ' + fmtTime(S.bomb.fuse));
    else if (S.phase === 'freeze') this.setText('timer', 'BUY ' + fmtTime(S.phaseT));
    else if (S.phase === 'live') this.setText('timer', fmtTime(S.phaseT));
    else this.setText('timer', '—');
    this.el.timer.classList.toggle('danger', S.bomb.state === 'planted');
    this.setText('score-g', String(S.score.G));
    this.setText('score-s', String(S.score.S));
    this.setText('round-label', 'ROUND ' + S.round + '  ·  FIRST TO ' + CFG.matchWins);
    // Bomb status
    let bombText = '';
    if (S.bomb.state === 'planted') bombText = '⚠ CHARGE AT SITE ' + S.bomb.site + ' — DEFUSE IT';
    else if (S.bomb.state === 'dropped') bombText = 'CHARGE DROPPED';
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
    // Channel bar
    const showChannel = !!(p.channel && p.alive);
    this.setVisible('channel', showChannel);
    if (showChannel) {
      const isDef = p.channel.kind === 'defuse';
      const frac = isDef ? S.bomb.defuseT / CFG.defuseTime : S.bomb.plantT / CFG.plantTime;
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
      && dist2XZ(p.pos.x, p.pos.z, S.bomb.pos.x, S.bomb.pos.z) < 2.89) hint = 'HOLD E — DEFUSE THE CHARGE';
    this.setText('hint', hint);
    // Buy menu
    const showBuy = this.buyOpen && S.phase === 'freeze' && p.alive;
    this.setVisible('buy-menu', showBuy);
    if (showBuy) this.refreshBuy(S);
    else this.buySig = '';
    // Death overlay
    const showDeath = S.started && !p.alive && S.phase === 'live';
    this.setVisible('death-overlay', showDeath);
    if (showDeath) this.setText('death-sub', 'You will rejoin next round  ·  Spectating a teammate');
  }
}
