import {
  loadState,
  saveState,
  setMuted,
  markSceneDone,
  resetSim,
  type GameState,
  type LocationId,
  type ItemId,
} from '../state/GameState';
import { LOCATIONS, LOCATION_ORDER } from '../data/ryokan/locations';
import { hotspotsFor, type HotspotDef } from '../data/ryokan/hotspots';
import { ITEMS, RECIPES, itemSvgMarkup } from '../data/ryokan/items';
import { ParallaxRenderer } from '../systems/Parallax';
import { simAudio } from '../audio/SimAudio';

function actionsFor(hs: HotspotDef, state: GameState): string[] {
  const a: string[] = ['Осмотреть'];
  if (hs.item && hs.takenFlag && !state.flags[hs.takenFlag]) a.push('Взять');
  if (hs.useWith?.length) {
    if (state.selected && hs.useWith.includes(state.selected)) a.push('Использовать: ' + ITEMS[state.selected].short);
    else a.push('Нужен предмет');
  }
  if (hs.complete) a.push('Стабилизировать канал');
  return a;
}

export class ImmersionScene {
  state: GameState;
  parallax: ParallaxRenderer;
  stage: HTMLElement;
  hsLayer: HTMLElement;
  exitLayer: HTMLElement;
  invEl: HTMLElement;
  hoverCard: HTMLElement;
  private eventTimer = 0 as ReturnType<typeof setInterval> | number;
  private threatActive = false;
  private threatCooldown = 0;
  private threatKind: 'light' | 'sound' | 'dweller' = 'dweller';
  private roomEnteredAt = Date.now();
  private lightActive = false;
  private noiseUntil = 0;
  private monsterHp = 42;
  private monsterMaxHp = 42;
  private monsterName = 'СЛУШАТЕЛЬ';
  private combatTurn = 0;
  private guarding = false;
  private dodgeReady = false;
  private enemyTurnTimer: ReturnType<typeof setTimeout> | number = 0;
  private combatTarget: 'head' | 'torso' | 'arms' | 'legs' = 'torso';
  private enemyAttackPattern = '';
  private enemyAttackStartedAt = 0;
  private enemyAttackWindowMs = 1100;
  private initiative = 100;
  private enemyArmsWeakened = false;
  private enemyLegsSlowed = false;
  private maskWorn = false;
  private maskLastTick = Date.now();
  private sanityTier = -1;
  private hallucinationTimer: ReturnType<typeof setInterval> | number = 0;
  private thoughtIndex = 0;
  private threatApproachTimer: ReturnType<typeof setInterval> | number = 0;
  private threatStartedAt = 0;
  private hallucinationCount = 0;
  private diving = true;
  private defeatShown = false;
  private sanityCollapseTick = 0;

  constructor() {
    this.state = loadState();
    this.maskWorn = this.state.maskWorn === true;
    document.body.classList.toggle('mask-worn', this.maskWorn);
    this.stage = document.getElementById('simStage')!;
    this.hsLayer = document.getElementById('hotspotLayer')!;
    this.exitLayer = document.getElementById('exitLayer')!;
    this.invEl = document.getElementById('invSlots')!;
    this.hoverCard = document.getElementById('hoverCard')!;

    let canvas = document.getElementById('simCanvas') as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'simCanvas';
      this.stage.prepend(canvas);
    }
    this.parallax = new ParallaxRenderer(canvas);

    this.stage.addEventListener('mousemove', (e) => {
      if (this.diving) return;
      const r = this.stage.getBoundingClientRect();
      this.parallax.setMouse(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        ((e.clientY - r.top) / r.height) * 2 - 1
      );
      // follow hover card near cursor if visible
      if (this.hoverCard.classList.contains('show')) {
        const x = e.clientX + 16;
        const y = e.clientY + 16;
        this.hoverCard.style.left = Math.min(x, window.innerWidth - 220) + 'px';
        this.hoverCard.style.top = Math.min(y, window.innerHeight - 120) + 'px';
      }
    });
    window.addEventListener('resize', () => this.resize());
  }

  async start() {
    this.bindChrome();
    this.resize();
    this.parallax.start();
    await this.playDiveIn();
    await this.loadLoc(this.state.location);
    this.buildHotspots();
    this.buildExits();
    this.renderInv();
    this.renderVitals();
    this.checkDefeat();
    this.renderMinimap();
    this.updateZone();
    this.startWorldClock();
    this.startSanityDistortions();
    this.pulseMatrix('ok');
    this.notify('Ты внутри сектора · Рёкан', 'ok');
    this.scheduleEvents();
    this.startMatrixStreams();
  }

  /** Boot: tunnel into Limbo */
  private playDiveIn(): Promise<void> {
    return new Promise((resolve) => {
      const overlay = document.getElementById('diveOverlay');
      if (!overlay) {
        this.diving = false;
        resolve();
        return;
      }
      overlay.classList.add('active');
      const log = document.getElementById('diveLog');
      const lines = [
        { t: 'ЦЕФЕЙ · HANDSHAKE', c: 'dim' },
        { t: 'НЕЙРО-МОСТ · ОТКРЫТИЕ КАНАЛА', c: '' },
        { t: 'СЕКТОР RK-01 · РЁКАН', c: 'cyan' },
        { t: 'СОМАТИЧЕСКИЙ ШЛЮЗ · СИНХР…', c: '' },
        { t: 'ПОГРУЖЕНИЕ', c: 'hi' },
      ];
      let i = 0;
      const push = () => {
        if (!log || i >= lines.length) return;
        const d = document.createElement('div');
        d.className = 'dive-line ' + lines[i].c;
        d.textContent = '> ' + lines[i].t;
        log.appendChild(d);
        i++;
        if (i < lines.length) setTimeout(push, 280 + Math.random() * 120);
      };
      simAudio.unlock();
      simAudio.dive(this.state.muted);
      setTimeout(push, 200);

      setTimeout(() => {
        overlay.classList.add('out');
        simAudio.whoosh(this.state.muted);
        setTimeout(() => {
          overlay.classList.remove('active', 'out');
          this.diving = false;
          resolve();
        }, 700);
      }, 2200);
    });
  }

  private resize() {
    const r = this.stage.getBoundingClientRect();
    this.parallax.resize(r.width, r.height);
  }

  private bindChrome() {
    document.getElementById('btnMute')?.addEventListener('click', () => {
      setMuted(this.state, !this.state.muted);
      const b = document.getElementById('btnMute');
      if (b) b.textContent = this.state.muted ? 'SFX OFF' : 'SFX ON';
      simAudio.unlock();
      if (!this.state.muted) {
        simAudio.click(false);
        const loc = LOCATIONS[this.state.location];
        simAudio.startAmbient(false, loc.ambient);
      } else simAudio.stopAmbient();
    });
    document.getElementById('btnExit')?.addEventListener('click', () => {
      window.location.href = '/scene-ryokan.html';
    });
    document.getElementById('btnReset')?.addEventListener('click', () => {
      if (!confirm('Сбросить симуляцию Рёкана?')) return;
      this.state = resetSim();
      void this.loadLoc('gate').then(() => {
        this.buildHotspots();
        this.buildExits();
        this.renderInv();
        this.renderVitals();
        this.renderMinimap();
        this.updateZone();
        this.notify('Симуляция сброшена', 'warn');
      });
    });
    document.getElementById('btnInspectItem')?.addEventListener('click', () => {
      if (!this.state.selected) { this.notify('Сначала выбери предмет в инвентаре', 'warn'); return; }
      this.openItemExam(this.state.selected);
    });
    document.getElementById('btnUseItem')?.addEventListener('click', () => this.useSelectedItem());
    document.getElementById('btnHide')?.addEventListener('click', () => this.resolveThreat('hide'));
    document.getElementById('btnConfront')?.addEventListener('click', () => this.startCombat());
    document.getElementById('btnCall')?.addEventListener('click', () => this.makeNoise('Ты громко окликнул кого-то в темноте.'));
    document.getElementById('combatAttack')?.addEventListener('click', () => this.combatAction('attack'));
    document.getElementById('combatGuard')?.addEventListener('click', () => this.combatAction('guard'));
    document.getElementById('combatDodge')?.addEventListener('click', () => this.combatDodge());
    document.getElementById('combatItem')?.addEventListener('click', () => this.combatAction('item'));
    document.getElementById('combatNoise')?.addEventListener('click', () => this.combatAction('noise'));
    document.getElementById('combatFlee')?.addEventListener('click', () => this.combatAction('flee'));
    document.querySelectorAll<HTMLButtonElement>('[data-hit-zone]').forEach(b => b.addEventListener('click', () => {
      const zone = b.dataset.hitZone;
      if (zone === 'head' || zone === 'torso' || zone === 'arms' || zone === 'legs') this.selectCombatTarget(zone);
    }));
    document.getElementById('modalClose')?.addEventListener('click', () => this.closeModal());
    document.getElementById('modalBackdrop')?.addEventListener('click', () => this.closeModal());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.getElementById('combatScreen')?.classList.contains('open')) this.combatAction('flee');
        else this.closeModal();
        return;
      }
      if (!document.getElementById('combatScreen')?.classList.contains('open') || e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === '1' || key === 'a') this.combatAction('attack');
      else if (key === '2' || key === ' ') this.combatDodge();
      else if (key === '3' || key === 'g') this.combatAction('guard');
      else if (key === '4' || key === 'i') this.combatAction('item');
      else if (key === '5' || key === 'f') this.combatAction('flee');
    });
    window.addEventListener('pointerdown', () => simAudio.unlock(), { once: true });
  }

  private scheduleEvents() {
    if (this.eventTimer) clearInterval(this.eventTimer as number);
    this.eventTimer = setInterval(() => {
      if (this.state.sanity <= 0 && !this.state.defeated) {
        this.sanityCollapseTick += 1;
        this.state.health = Math.max(0, this.state.health - 8);
        this.notify('Рассудок исчез. Тело больше не различает реальность.', 'warn');
        this.renderVitals();
        saveState(this.state);
        if (this.state.health <= 0) return;
      } else this.sanityCollapseTick = 0;
      if (this.threatActive || Date.now() < this.threatCooldown || this.state.defeated) return;
      const stayed = Date.now() - this.roomEnteredAt;
      this.tickMaskEffects();
      const dangerFill = document.getElementById('dangerFill') as HTMLElement | null;
      const dangerValue = document.getElementById('dangerValue');
      const watchValue = document.getElementById('watchValue');
      const activeNoise = Date.now() < this.noiseUntil;
      const watched = this.threatActive || (activeNoise && Math.random() < .35);
      if (dangerFill) dangerFill.style.width = (this.threatActive ? 100 : activeNoise ? 72 : watched ? 42 : 12) + '%';
      if (dangerValue) dangerValue.textContent = this.threatActive ? 'КРИТИЧЕСКАЯ' : activeNoise ? 'ПОВЫШЕНА' : watched ? 'СРЕДНЯЯ' : 'НИЗКАЯ';
      if (watchValue) watchValue.textContent = this.threatActive ? 'ОНО ВИДИТ ВАС' : watched ? 'ЗА ВАМИ НАБЛЮДАЮТ' : 'ЗА ВАМИ НЕ СЛЕДЯТ';
      if (!activeNoise && !this.threatActive) {
        const caption = document.getElementById('soundCaption'); if (caption) caption.textContent = 'Тишина… (слышен дождь)';
      }
      // Each creature has its own trigger condition.
      if (this.lightActive && !this.maskWorn && ['garden','engawa','hall'].includes(this.state.location) && Math.random() < .16) {
        this.startThreat('light'); return;
      }
      if (Date.now() < this.noiseUntil && ['gate','garden','engawa','genkan'].includes(this.state.location) && Math.random() < .2) {
        this.startThreat('sound'); return;
      }
      if (stayed > (this.maskWorn ? 60000 : 90000) && ['hall','storage','genkan'].includes(this.state.location) && Math.random() < .16) {
        this.startThreat('dweller'); return;
      }
      if (this.maskWorn && Math.random() < .28) { simAudio.maskWhisper(this.state.muted, Math.min(2, 0.6 + this.state.maskExposure / 80)); this.showSense('◉','Маска шепчет твоим голосом…',true); }
      if (Math.random() < .24) {
        const roll = Math.random();
        if (roll < .42) { simAudio.steps(this.state.muted); this.showSense('♬','Шаги… (далеко)',false); this.state.flags.heard_steps = true; }
        else if (roll < .72) { simAudio.creak(this.state.muted); this.showSense('⌁','Где-то вдалеке скрип…',false); }
        else { simAudio.whisper(this.state.muted); this.showSense('◉','Похоже, кто-то наблюдает…',true); this.state.sanity = Math.max(0,this.state.sanity-1); }
      }
      saveState(this.state); this.renderVitals();
    }, 5000);
  }

  private startWorldClock() {
    const update = () => {
      const d = new Date();
      const time = document.getElementById('worldTime');
      const date = document.getElementById('worldDate');
      if (time) time.textContent = d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      if (date) date.textContent = d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});
    };
    update(); setInterval(update, 15000);
  }
  private showSense(icon: string, message: string, warning: boolean) {
    const feed = document.getElementById('senseFeed'); if (!feed) return;
    const el = document.createElement('div'); el.className = 'sense-event' + (warning ? ' warning' : '');
    const glyph = document.createElement('span'); glyph.className = 'sense-icon'; glyph.textContent = icon;
    const copy = document.createElement('span'); copy.className = 'sense-copy'; copy.textContent = message;
    const wave = document.createElement('span'); wave.className = 'sound-wave';
    for (let i=0;i<4;i++) wave.appendChild(document.createElement('i'));
    el.append(glyph,copy,wave);
    feed.prepend(el); while (feed.children.length > 4) feed.lastElementChild?.remove();
    setTimeout(() => el.remove(), 6500);
  }

  private setAwareness(level: 'hidden' | 'suspected' | 'seen') {
    const indicator = document.getElementById('awarenessIndicator');
    const label = document.getElementById('awarenessLabel');
    if (!indicator) return;
    indicator.dataset.state = level;
    indicator.setAttribute('aria-label', level === 'hidden' ? 'Нас не заметили' : level === 'suspected' ? 'Кто-то подозревает наше присутствие' : 'Нас заметили');
    if (label) label.textContent = level === 'hidden' ? 'НЕ ЗАМЕЧЕНЫ' : level === 'suspected' ? 'ПОДОЗРЕВАЕТ' : 'НАС ЗАМЕТИЛИ';
  }

  private startThreat(kind: 'light' | 'sound' | 'dweller' = 'dweller') {
    this.threatKind = kind;
    this.threatActive = true; this.setAwareness('suspected'); this.state.sanity = Math.max(0,this.state.sanity-5); saveState(this.state); this.renderVitals();
    simAudio.monster(this.state.muted); this.showSense('◉','Что-то движется в темноте',true); this.pulseMatrix('alert');
    this.showCreatureInScene();
    document.body.classList.remove('threat-kind-light','threat-kind-sound','threat-kind-dweller');
    document.body.classList.add('threat-active','threat-kind-' + kind);
    const radar = document.getElementById('radarSignal'); if (radar) radar.textContent = kind === 'light' ? 'СВЕТ ОБНАРУЖЕН' : kind === 'sound' ? 'ШУМ ЗАСЕЧЁН' : 'ПРИСУТСТВИЕ РЯДОМ';
    const panel=document.getElementById('threatOverlay');
    const title=document.getElementById('threatTitle');
    const copy=document.getElementById('threatText');
    if(title) title.textContent=kind==='light'?'СЛЕПОЙ ИДЁТ НА СВЕТ':kind==='sound'?'СЛУШАТЕЛЬ ИДЁТ НА ШУМ':'ЖИЛЕЦ ВЫХОДИТ ИЗ СТЕНЫ';
    if(copy) copy.textContent=kind==='light'?'Существо тянется к источнику света. Погаси фонарь и не двигайся.':kind==='sound'?'Оно услышало тебя и приближается на звук. Замри или попробуй отвлечь его.':'Ты слишком долго оставался в одной комнате. Оно уже здесь.';
    panel?.classList.add('open'); panel?.setAttribute('aria-hidden','false');
    this.startThreatApproach();
  }

  private resolveThreat(choice: 'hide' | 'confront') {
    if(!this.threatActive)return;
    if (this.threatApproachTimer) clearInterval(this.threatApproachTimer as number);
    this.threatApproachTimer = 0;
    if (choice === 'confront') { this.startCombat(); return; }
    this.threatActive=false; this.threatCooldown=Date.now()+35000;
    document.getElementById('threatOverlay')?.classList.remove('open');
    document.getElementById('threatOverlay')?.setAttribute('aria-hidden','true');
    document.body.classList.remove('threat-active','threat-kind-light','threat-kind-sound','threat-kind-dweller');
    document.getElementById('sceneCreature')?.remove();
    const radar = document.getElementById('radarSignal'); if (radar) radar.textContent = 'СИГНАЛ СТАБИЛЕН';
    if(this.threatKind==='light' && choice==='confront' && this.lightActive) { this.lightActive=false; simAudio.whoosh(this.state.muted); this.notify('Ты погасил свет. Слепой потерял ориентир.','ok'); this.state.sanity=Math.min(100,this.state.sanity+2); }
    else if(this.threatKind==='sound' && choice==='hide') { this.noiseUntil=0; this.notify('Ты замер. Слушатель потерял источник шума.','ok'); }
    else if(choice==='hide') {
      if(Math.random()<.78){simAudio.whisper(this.state.muted);this.notify('Ты затаился. Шаги медленно удаляются.','ok');this.state.sanity=Math.max(0,this.state.sanity-1);}
      else{simAudio.monster(this.state.muted);this.notify('Оно заметило движение!','warn');this.state.health=Math.max(0,this.state.health-9);this.state.sanity=Math.max(0,this.state.sanity-7);}
    } else if(this.state.selected==='ember_lantern') {
      simAudio.whoosh(this.state.muted);this.notify('Свет фонаря заставил существо отступить.','ok');this.state.sanity=Math.min(100,this.state.sanity+2);
    } else {simAudio.deny(this.state.muted);this.notify('Без подходящего средства ты лишь разозлил его.','warn');this.state.health=Math.max(0,this.state.health-14);this.state.sanity=Math.max(0,this.state.sanity-8);}
    saveState(this.state);this.renderVitals();
  }

  private startMatrixStreams() {
    const left = document.getElementById('matrixLeft');
    const right = document.getElementById('matrixRight');
    const chars = '01アイウエオカキクケコサシスセソ01#@$%<>/\\|';
    const fill = (el: HTMLElement | null) => {
      if (!el) return;
      let html = '';
      for (let i = 0; i < 30; i++) {
        let line = '';
        for (let j = 0; j < 5; j++) line += chars[(Math.random() * chars.length) | 0];
        html += `<div>${line}</div>`;
      }
      el.innerHTML = html;
    };
    fill(left);
    fill(right);
    setInterval(() => {
      fill(left);
      fill(right);
    }, 2000);
  }

  pulseMatrix(mode: 'idle' | 'alert' | 'ok') {
    document.body.dataset.matrix = mode;
    if (mode !== 'idle') setTimeout(() => { document.body.dataset.matrix = 'idle'; }, 2000);
  }

  notify(msg: string, kind: 'info' | 'warn' | 'ok' = 'info') {
    const host = document.getElementById('notifyHost');
    if (!host) return;
    const n = document.createElement('div');
    n.className = 'notify ' + kind;
    n.setAttribute('role','status');
    n.textContent = msg;
    n.style.setProperty('--notice-index', String(host.children.length));
    host.appendChild(n);
    while (host.children.length > 4) host.firstElementChild?.remove();
    requestAnimationFrame(() => n.classList.add('show'));
    setTimeout(() => {
      n.classList.remove('show');
      setTimeout(() => n.remove(), 400);
    }, 4200);
  }

  private showHover(hs: HotspotDef, el: HTMLElement) {
    const acts = actionsFor(hs, this.state);
    this.hoverCard.innerHTML =
      `<div class="hc-title">${hs.label}</div>` +
      acts.map((a) => `<div class="hc-act">▸ ${a}</div>`).join('');
    this.hoverCard.classList.add('show');
    const r = el.getBoundingClientRect();
    this.hoverCard.style.left = Math.min(r.right + 8, window.innerWidth - 210) + 'px';
    this.hoverCard.style.top = Math.min(r.top, window.innerHeight - 100) + 'px';
  }

  private hideHover() {
    this.hoverCard.classList.remove('show');
  }

  private async loadLoc(id: LocationId) {
    const loc = LOCATIONS[id];
    const ok = await this.parallax.loadImage(loc.image, loc.filter || '');
    simAudio.startAmbient(this.state.muted, loc.ambient);
    const err = document.getElementById('stageError');
    if (err) {
      err.hidden = ok;
      if (!ok) err.textContent = 'Нет кадра · ' + loc.image;
    }
  }

  private updateZone() {
    const loc = LOCATIONS[this.state.location];
    const z = document.getElementById('zoneLabel');
    if (z) z.textContent = loc.title;
    const s = document.getElementById('zoneSub');
    if (s) s.textContent = loc.subtitle;
  }

  private itemAsset(id: ItemId): string {
    // The legacy fox_mask.png is an atlas fragment, not a standalone sprite.
    // Render a self-contained transparent vector until a clean painted asset is supplied.
    if (id === 'stitched_mask') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 280">
        <defs>
          <linearGradient id="paper" x2="0.8" y2="1"><stop stop-color="#e3d5bd"/><stop offset=".48" stop-color="#a9957c"/><stop offset="1" stop-color="#54463e"/></linearGradient>
          <linearGradient id="ink" x2="1" y2="1"><stop stop-color="#17191c"/><stop offset="1" stop-color="#05070a"/></linearGradient>
          <filter id="shadow" x="-40%" y="-30%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>
        </defs>
        <ellipse cx="120" cy="252" rx="70" ry="12" fill="#000" opacity=".55" filter="url(#shadow)"/>
        <path d="M42 72 Q10 26 20 10 Q64 22 85 52 M198 72 Q230 26 220 10 Q176 22 155 52" fill="none" stroke="#6d2929" stroke-width="5" stroke-linecap="round"/>
        <path d="M120 22 C85 30 48 70 42 125 Q38 196 120 252 Q202 196 198 125 C192 70 155 30 120 22Z" fill="url(#paper)" stroke="#2b2523" stroke-width="8"/>
        <path d="M120 31 C90 54 69 92 68 143 Q68 196 120 235 Q172 196 172 143 C171 92 150 54 120 31Z" fill="none" stroke="#453a34" stroke-width="2" opacity=".8"/>
        <path d="M53 112 Q86 77 108 119 Q88 144 55 132Z M187 112 Q154 77 132 119 Q152 144 185 132Z" fill="url(#ink)" stroke="#2b2422" stroke-width="4"/>
        <path d="M120 100 L105 156 L120 171 L135 156Z" fill="#3b302d" stroke="#1b1717" stroke-width="3"/>
        <path d="M80 179 Q120 198 160 179 M95 196 Q120 210 145 196" fill="none" stroke="#6b282b" stroke-width="4" stroke-linecap="round"/>
        <path d="M120 25 L120 245" stroke="#eee0c8" stroke-width="2" stroke-dasharray="4 8" opacity=".65"/>
        <path d="M43 126 Q32 146 47 164 M197 126 Q208 146 193 164" fill="none" stroke="#7d292d" stroke-width="3"/>
        <circle cx="120" cy="58" r="5" fill="#7c252b"/><circle cx="120" cy="58" r="2" fill="#e8c7a5"/>
      </svg>`;
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }
    const files: Partial<Record<ItemId,string>> = {
      ryokan_key:'key', wet_key_half:'key', wet_key_other:'key', paper_lantern_shard:'mirror_shard',
      kokeshi_note:'sealed_scroll', silk_thread:'red_cord', matchbox:'matches',
      medicinal_herbs:'herbs', copper_bell:'bell', herbal_poultice:'bandage',
      warding_charm:'ward_tag', ember_lantern:'old_lantern', black_seed:'toxic_flower',
      stitched_mask:'fox_mask'
    };
    return '/assets/game/items/' + (files[id] || 'sealed_scroll') + '.png';
  }

  private buildHotspots() {
    this.hsLayer.innerHTML = '';
    for (const hs of hotspotsFor(this.state.location)) {
      if (hs.takenFlag && this.state.flags[hs.takenFlag]) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className =
        'hotspot' +
        (hs.complete ? ' complete' : '') +
        (hs.useWith ? ' door' : '') +
        (hs.item ? ' loot' : '');
      b.style.left = hs.x + '%';
      b.style.top = hs.y + '%';
      b.style.width = hs.w + '%';
      b.style.height = hs.h + '%';
      if (hs.item) { const art = this.itemAsset(hs.item); b.innerHTML = `<span class="world-loot-art"><img src="${art}" alt="" draggable="false"></span><span class="world-loot-name">${hs.label}</span>`; }
      else b.innerHTML = `<span class="world-object-mark">${hs.complete ? '◇' : '⌖'}</span><span class="world-loot-name">${hs.label}</span>`;
      b.addEventListener('mouseenter', () => {
        simAudio.hover(this.state.muted);
        this.showHover(hs, b);
      });
      b.addEventListener('mouseleave', () => this.hideHover());
      b.addEventListener('click', () => {
        this.hideHover();
        this.onHotspot(hs);
      });
      this.hsLayer.appendChild(b);
    }
  }

  private buildExits() {
    this.exitLayer.innerHTML = '';
    const loc = LOCATIONS[this.state.location];
    for (const ex of loc.exits) {
      let blocked = false;
      if (ex.needsFlag) blocked = !this.state.flags[ex.needsFlag];
      else if (ex.needsItem) blocked = !this.state.inventory.includes(ex.needsItem as ItemId);
      if (ex.to === 'genkan' && this.state.flags.door_unlocked) blocked = false;

      // only show usable exits (or locked with label)
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'exit-btn' + (blocked ? ' locked' : ' open');
      a.style.left = ex.x + '%';
      a.style.top = ex.y + '%';
      a.textContent = blocked ? '⊘ ' + ex.label : '→ ' + ex.label;
      a.addEventListener('mouseenter', () => {
        if (!blocked) simAudio.hover(this.state.muted);
        this.hoverCard.innerHTML = blocked
          ? `<div class="hc-title">${ex.label}</div><div class="hc-act warn">▸ ${ex.blockedText || 'Закрыто'}</div>`
          : `<div class="hc-title">${ex.label}</div><div class="hc-act">▸ Перейти</div>`;
        this.hoverCard.classList.add('show');
        const r = a.getBoundingClientRect();
        this.hoverCard.style.left = Math.min(r.right + 8, window.innerWidth - 210) + 'px';
        this.hoverCard.style.top = Math.min(r.top, window.innerHeight - 80) + 'px';
      });
      a.addEventListener('mouseleave', () => this.hideHover());
      a.addEventListener('click', () => {
        this.hideHover();
        if (blocked) {
          simAudio.deny(this.state.muted);
          this.notify(ex.blockedText || 'Путь закрыт', 'warn');
          this.pulseMatrix('alert');
          return;
        }
        void this.go(ex.to);
      });
      this.exitLayer.appendChild(a);
    }
  }

  private async go(to: LocationId) {
    simAudio.whoosh(this.state.muted);
    this.makeNoise('Шаги эхом разнеслись по локации.');
    this.state.location = to;
    this.roomEnteredAt = Date.now();
    this.noiseUntil = Date.now() + 4500;
    if (!this.state.visited.includes(to)) this.state.visited.push(to);
    saveState(this.state);
    this.stage.classList.add('fade');
    // reveal flash
    const flash = document.getElementById('revealFlash');
    if (flash) {
      flash.classList.add('on');
      setTimeout(() => flash.classList.remove('on'), 500);
    }
    await new Promise((r) => setTimeout(r, 320));
    await this.loadLoc(to);
    this.buildHotspots();
    this.buildExits();
    this.renderMinimap();
    this.updateZone();
    this.stage.classList.remove('fade');
    this.stage.classList.add('reveal');
    setTimeout(() => this.stage.classList.remove('reveal'), 600);
    this.notify(LOCATIONS[to].title, 'info');
    this.pulseMatrix('ok');
    simAudio.open(this.state.muted);
  }

  private onHotspot(hs: HotspotDef) {
    simAudio.click(this.state.muted);

    if (this.state.selected && hs.useWith?.length) {
      if (hs.useWith.includes(this.state.selected)) {
        if (hs.useFlag) this.state.flags[hs.useFlag] = true;
        this.state.selected = null;
        saveState(this.state);
        simAudio.door(this.state.muted);
        this.notify(hs.useSuccess || 'Сработало', 'ok');
        this.pulseMatrix('ok');
        this.buildExits();
        this.renderInv();
        this.syncHand();
        return;
      }
      simAudio.deny(this.state.muted);
      this.notify('Это сюда не подходит', 'warn');
      return;
    }

    this.openModal(hs);
  }

  private openModal(hs: HotspotDef) {
    const modal=document.getElementById('simModal')!;
    const riskyFind = hs.item === 'black_seed' || hs.item === 'stitched_mask';
    modal.classList.toggle('risk-modal', riskyFind);
    document.getElementById('modalTitle')!.textContent=hs.label;
    const body=document.getElementById('modalBody')!;
    const visual=document.getElementById('modalVisual');
    const item=hs.item?ITEMS[hs.item]:null;
    if(visual) visual.innerHTML=hs.item?`<img class="item-art-image" src="${this.itemAsset(hs.item)}" alt="${item?.name || hs.label}">`:hs.complete?'<svg viewBox="0 0 64 64" width="210" height="210"><rect x="16" y="16" width="32" height="32" fill="none" stroke="#1ec99a" stroke-width="2"/><text x="32" y="38" text-anchor="middle" fill="#1ec99a" font-size="10" font-family="monospace">RK-01</text></svg>':'';
    body.textContent=item?item.name+'\n\n'+hs.examine:hs.examine;
    body.classList.remove('thought-text');
    if(hs.item==='black_seed'||hs.item==='stitched_mask'){
      const risk=document.createElement('span');risk.className='item-risk';risk.textContent='НЕИЗВЕСТНЫЙ ОБЪЕКТ · Возможна психическая реакция';body.appendChild(risk);
    }
    const actions=document.getElementById('modalActions')!;actions.innerHTML='';
    const add=(label:string,cls:string,fn:()=>void)=>{const b=document.createElement('button');b.className='btn '+cls;b.textContent=label;b.onclick=fn;actions.appendChild(b);};
    add('НЕ ТРОГАТЬ','danger',()=>this.closeModal());
    if(item&&hs.item&&hs.takenFlag&&!this.state.flags[hs.takenFlag]){
      add('ИЗУЧИТЬ','',()=>{
        const detail=document.createElement('div');detail.className='item-detail';
        detail.textContent=hs.item==='black_seed'?'Под плёнкой видны тонкие жилки. Они шевелятся в ответ на тепло руки. Ты чувствуешь чужую мысль: «посади меня».':hs.item==='stitched_mask'?'Нить прошита изнутри. На бумаге проступает отпечаток лица, хотя маска лежит неподвижно. Не надевай её.':'Ты замечаешь мелкие детали, которые не были видны издалека.';
        body.appendChild(detail);simAudio.whisper(this.state.muted);this.showSense('◉','Ты внимательно изучил находку',false);
      });
      add('ВЗЯТЬ','solid',()=>{
        if(this.state.inventory.length>=12){this.notify('Инвентарь заполнен','warn');return;}
        this.state.inventory.push(hs.item!);this.state.flags[hs.takenFlag!]=true;
        if(hs.item==='black_seed'){this.state.sanity=Math.max(0,this.state.sanity-13);this.notify('Семя дёрнулось в ладони. Рассудок пошатнулся.','warn');simAudio.whisper(this.state.muted);}
        else if(hs.item==='stitched_mask'){this.state.sanity=Math.max(0,this.state.sanity-8);this.notify('Из маски донёсся короткий вдох.','warn');simAudio.whisper(this.state.muted);}
        else this.notify('Получено: '+item.name,'ok');
        saveState(this.state);simAudio.take(this.state.muted);this.pulseMatrix('ok');this.closeModal();this.buildHotspots();this.renderInv();this.renderVitals();
      });
    }
    if(hs.complete)add('ВЫБРАТЬ ИСХОД','solid',()=>{
      const title=document.getElementById('modalTitle'); if(title) title.textContent='ПОСЛЕДНИЙ ВЫБОР';
      const body=document.getElementById('modalBody'); if(body) body.textContent='Канал отвечает твоим голосом. Мы можем очистить его, связать себя с ним или разрушить узел. Этот выбор останется с нами в следующих секторах.';
      const visual=document.getElementById('modalVisual'); if(visual) visual.innerHTML='<div class="ending-sigil" aria-hidden="true">◇</div>';
      const actions=document.getElementById('modalActions'); if(!actions)return; actions.innerHTML='';
      const options=[
        ['ОЧИСТИТЬ КАНАЛ','clear','Мы сохраняем себя. Следующая сцена начнётся с более ясным рассудком.'],
        ['ПРИНЯТЬ СВЯЗЬ','bind','Маска останется частью нас. Мы получим доступ к закрытым голосам, но начнём следующую сцену с меньшим рассудком.'],
        ['РАЗРУШИТЬ УЗЕЛ','break','Угроза ослабнет, но часть найденных вещей будет потеряна. Следующая сцена начнётся с ранения.']
      ] as const;
      for(const [label,ending,hint] of options){
        const b=document.createElement('button'); b.type='button'; b.className='primary'; b.textContent=label; b.title=hint;
        b.addEventListener('click',()=>this.chooseEnding(ending)); actions.appendChild(b);
      }
      const note=document.getElementById('modalNote'); if(note) note.textContent='Выбор необратим в рамках текущего прохождения.';
    });
    modal.classList.add('open');simAudio.open(this.state.muted);
  }

  private chooseEnding(ending: 'clear'|'bind'|'break') {
    this.state.completed = true;
    this.state.ending = ending;
    this.state.flags.ending_clear = ending === 'clear';
    this.state.flags.ending_bind = ending === 'bind';
    this.state.flags.ending_break = ending === 'break';
    // Persistent story flags are read by later scenes; they deliberately survive scene transitions.
    this.state.flags.next_scene_clean_signal = ending === 'clear';
    this.state.flags.next_scene_mask_bound = ending === 'bind';
    this.state.flags.next_scene_wounded = ending === 'break';
    this.state.flags.next_scene_creatures_weakened = ending === 'break';
    this.state.flags.next_scene_whispers = ending === 'bind';
    if (ending === 'clear') {
      this.state.sanity = Math.min(100, this.state.sanity + 18);
      this.state.flags.channel_clean = true;
      this.state.flags.mask_voice_known = false;
    } else if (ending === 'bind') {
      this.state.maskWorn = true;
      this.maskWorn = true;
      this.state.sanity = Math.max(1, this.state.sanity - 12);
      this.state.flags.mask_voice_known = true;
      this.state.flags.channel_bound = true;
      document.body.classList.add('mask-worn');
    } else {
      this.state.health = Math.max(1, this.state.health - 12);
      this.state.inventory = this.state.inventory.filter(id => id !== 'black_seed');
      this.state.selected = this.state.inventory.includes(this.state.selected as ItemId) ? this.state.selected : null;
      this.state.flags.channel_broken = true;
      this.state.flags.creatures_weakened = true;
    }
    saveState(this.state);
    markSceneDone();
    simAudio.complete(this.state.muted);
    this.closeModal();
    this.renderInv();
    this.renderVitals();
    const copy = ending === 'clear' ? 'Канал очищен. В голове впервые за долгое время становится тихо.' :
      ending === 'bind' ? 'Связь принята. За нами теперь кто-то отвечает из темноты.' :
      'Узел разрушен. По ту сторону что-то закричало — и замолчало.';
    this.notify(copy,'ok');
    this.showSense('◇',copy,ending !== 'clear');
    window.setTimeout(()=>{ window.location.href='/scene-ryokan.html'; },1800);
  }

  private closeModal() {
    document.getElementById('simModal')?.classList.remove('open', 'risk-modal');
  }

  private renderInv() {
    this.invEl.innerHTML = '';
    const count = document.getElementById('inventoryCount');
    if (count) count.textContent = this.state.inventory.length + ' / 12';
    for (const id of this.state.inventory) {
      const def = ITEMS[id];
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'inv-slot' + (this.state.selected === id ? ' selected' : '');
      slot.innerHTML = `${itemSvgMarkup(id, 36)}<span class="n">${def.short}</span>`;
      slot.title = def.name + ' · ЛКМ выбрать · ПКМ осмотр';
      slot.addEventListener('click', () => this.onInv(id));
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.openItemExam(id);
      });
      this.invEl.appendChild(slot);
    }
    for (let i = this.state.inventory.length; i < 12; i++) {
      const empty = document.createElement('div');
      empty.className = 'inv-slot inv-slot-empty';
      empty.setAttribute('aria-hidden', 'true');
      this.invEl.appendChild(empty);
    }
    this.syncHand();
    this.renderVitals();
  }

  private renderVitals() {
    const health = Math.max(0, Math.min(100, this.state.health ?? 100));
    const sanity = Math.max(0, Math.min(100, this.state.sanity ?? 100));
    const healthFill = document.getElementById('healthFill') as HTMLElement | null;
    const sanityFill = document.getElementById('sanityFill') as HTMLElement | null;
    const healthValue = document.getElementById('healthValue');
    const sanityValue = document.getElementById('sanityValue');
    if (healthFill) healthFill.style.width = health + '%';
    if (sanityFill) sanityFill.style.width = sanity + '%';
    if (healthValue) healthValue.textContent = String(health);
    if (sanityValue) sanityValue.textContent = String(sanity);
    this.applySanityTier(sanity);
    this.checkDefeat();
  }

  private checkDefeat() {
    if (this.defeatShown || (!this.state.defeated && this.state.health > 0)) return;
    this.defeatShown = true;
    this.state.health = 0;
    this.state.defeated = true;
    saveState(this.state);
    if (this.threatApproachTimer) clearInterval(this.threatApproachTimer as number);
    if (this.enemyTurnTimer) clearTimeout(this.enemyTurnTimer as number);
    this.threatActive = false;
    document.getElementById('threatOverlay')?.classList.remove('open');
    document.getElementById('combatScreen')?.classList.remove('open');
    document.getElementById('sceneCreature')?.remove();
    document.body.classList.remove('combat-active','threat-active');
    const overlay = document.createElement('section');
    overlay.className = 'limbo-defeat';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    const defeatReason = this.state.sanity <= 0 ? 'Рассудок обрушился. Тело не выдержало и остановилось.' : 'Здоровье исчерпано. Тело больше не отвечает.';
    overlay.innerHTML = '<div class="limbo-defeat-panel"><span>СИГНАЛ ПОТЕРЯН · RK-01</span><h1>СУБЪЕКТ ПОТЕРЯН</h1><p></p><button type="button" id="defeatRestart">НАЧАТЬ ЗАНОВО</button><a href="/scene-ryokan.html">ВЕРНУТЬСЯ К ДОСЬЕ</a></div>';
    const reason = overlay.querySelector('p'); if (reason) reason.textContent = defeatReason;
    document.body.appendChild(overlay);
    overlay.querySelector('#defeatRestart')?.addEventListener('click', () => { resetSim(); window.location.reload(); });
    simAudio.deny(this.state.muted);
  }

  private syncHand() {
    const sel = document.getElementById('handLabel');
    if (!sel) return;
    sel.textContent = this.state.selected
      ? 'В РУКАХ: ' + ITEMS[this.state.selected].name
      : 'В РУКАХ: —';
    const preview = document.getElementById('selectedItemPreview');
    if (preview) {
      if (this.state.selected) {
        const def = ITEMS[this.state.selected];
        preview.innerHTML = '<div class="selected-art"></div><div class="selected-copy"><strong></strong><span></span><small>ПКМ по слоту — подробный осмотр</small></div>';
        preview.querySelector('.selected-art')!.innerHTML = `<img class="item-art-image" src="${this.itemAsset(this.state.selected)}" alt="">`;
        preview.querySelector('strong')!.textContent = def.name;
        preview.querySelector('.selected-copy span')!.textContent = def.examine;
        const help: Partial<Record<ItemId, string>> = {
          herbal_poultice: 'ИСПОЛЬЗОВАТЬ: восстановит 25 HP · расходуется',
          warding_charm: 'ИСПОЛЬЗОВАТЬ: восстановит 20 рассудка · расходуется',
          ember_lantern: 'ИСПОЛЬЗОВАТЬ: включить/выключить свет · свет привлекает существ',
          stitched_mask: 'ИСПОЛЬЗОВАТЬ: надеть/снять · защита от взгляда, но рассудок постепенно падает',
          medicinal_herbs: 'ПРИМЕНЕНИЕ: использовать на подходящем объекте или изучить',
          matchbox: 'ПРИМЕНЕНИЕ: зажечь источник света, если он найден',
          copper_bell: 'ПРИМЕНЕНИЕ: отвлечь существо звуком — но шум может привлечь другое',
          black_seed: 'ПРИМЕНЕНИЕ: пока неизвестно. Не держи долго в руках',
          ryokan_key: 'ПРИМЕНЕНИЕ: открыть соответствующий замок на локации',
          wet_key_half: 'ПРИМЕНЕНИЕ: соединить со второй половиной ключа',
          wet_key_other: 'ПРИМЕНЕНИЕ: соединить с первой половиной ключа',
          paper_lantern_shard: 'ПРИМЕНЕНИЕ: осмотреть источники света и отражающие поверхности',
          kokeshi_note: 'ПРИМЕНЕНИЕ: изучить; подсказка к тайнику или механизму',
          silk_thread: 'ПРИМЕНЕНИЕ: соединить с подходящим предметом',
        };
        let hint = preview.querySelector('.selected-copy small');
        if (!hint) { hint = document.createElement('small'); preview.querySelector('.selected-copy')?.appendChild(hint); }
        if (hint) hint.textContent = help[this.state.selected] || 'ПКМ — осмотреть · выбери объект сцены, чтобы попробовать применить';
      } else {
        preview.innerHTML = '<div class="selected-art">—</div><div class="selected-copy">Выбери предмет в инвентаре</div>';
      }
    }
  }


  private makeNoise(message: string) {
    this.noiseUntil = Date.now() + 9000;
    const caption = document.getElementById('soundCaption');
    if (caption) caption.textContent = 'ШУМ: ВЫСОКИЙ · источник — ты';
    const danger = document.getElementById('dangerValue');
    if (danger) danger.textContent = 'ПОВЫШЕНА';
    const fill = document.getElementById('dangerFill') as HTMLElement | null;
    if (fill) fill.style.width = '72%';
    this.showSense('◖))', message, true);
    simAudio.click(this.state.muted);
  }

  private showCreatureInScene() {
    document.getElementById('sceneCreature')?.remove();
    const el = document.createElement('div');
    el.id = 'sceneCreature';
    el.className = 'scene-creature scene-creature-' + this.threatKind;
    el.innerHTML = `<img class="creature-sprite" src="/assets/game/creatures/${this.threatKind === 'light' ? 'blind' : this.threatKind === 'sound' ? 'listener' : 'dweller'}.png" alt=""><span class="creature-eyes"></span><i></i><b></b>`;
    el.setAttribute('aria-label', this.threatKind === 'light' ? 'Слепой' : this.threatKind === 'sound' ? 'Слушатель' : 'Жилец');
    this.stage.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
  }

  private startCombat() {
    if (this.threatApproachTimer) clearInterval(this.threatApproachTimer as number);
    this.threatApproachTimer = 0;
    this.threatActive = false;
    this.setAwareness('seen');
    document.getElementById('threatOverlay')?.classList.remove('open');
    document.getElementById('threatOverlay')?.setAttribute('aria-hidden','true');
    if (this.enemyTurnTimer) clearTimeout(this.enemyTurnTimer as number);
    this.dodgeReady = false; this.guarding = false; this.initiative = 100; this.enemyArmsWeakened = false; this.enemyLegsSlowed = false;
    this.monsterMaxHp = this.threatKind === 'light' ? 58 : this.threatKind === 'sound' ? 42 : 76;
    this.monsterHp = this.monsterMaxHp;
    this.monsterName = this.threatKind === 'light' ? 'СЛЕПОЙ' : this.threatKind === 'sound' ? 'СЛУШАТЕЛЬ' : 'ЖИЛЕЦ';
    this.combatTurn = 0; this.combatTarget = 'torso';
    const name = document.getElementById('combatMonsterName'); if (name) name.textContent = this.monsterName;
    const sprite = document.getElementById('combatMonsterSprite') as HTMLImageElement | null;
    if (sprite) sprite.src = '/assets/game/creatures/' + (this.threatKind === 'light' ? 'blind' : this.threatKind === 'sound' ? 'listener' : 'dweller') + '.png';
    const art = document.getElementById('combatMonsterArt');
    art?.classList.remove('combat-beast-light','combat-beast-sound','combat-beast-dweller');
    art?.classList.add('combat-beast-' + this.threatKind);
    const screen = document.getElementById('combatScreen'); screen?.classList.add('open'); screen?.setAttribute('aria-hidden','false');
    const dodge = document.getElementById('combatDodge') as HTMLButtonElement | null; if (dodge) dodge.disabled = true;
    document.body.classList.add('combat-active');
    this.renderCombatWounds();
    this.updateCombatHud('Существо приближается. Выбери часть тела и действие.');
    this.makeNoise('Схватка началась. Шум разбудит всё вокруг.');
    simAudio.monster(this.state.muted);
  }

  private updateCombatHud(log: string) {
    const hpText = document.getElementById('monsterHpText'); if (hpText) hpText.textContent = this.monsterHp + ' / ' + this.monsterMaxHp;
    const hpFill = document.getElementById('monsterHpFill') as HTMLElement | null; if (hpFill) hpFill.style.width = (this.monsterHp / this.monsterMaxHp * 100) + '%';
    const player = document.getElementById('combatPlayerHp'); if (player) player.textContent = String(this.state.health);
    const playerFill = document.getElementById('combatPlayerFill') as HTMLElement | null; if (playerFill) playerFill.style.width = this.state.health + '%';
    const text = document.getElementById('combatLog'); if (text) text.textContent = log;
    const phase = document.getElementById('combatPhase'); if (phase) phase.textContent = this.dodgeReady ? 'ВРАГ АТАКУЕТ' : 'ТВОЙ ХОД';
    const ini = document.getElementById('initiativeFill') as HTMLElement | null; if (ini) ini.style.width = this.initiative + '%';
    const enemyIni = document.getElementById('enemyInitiativeFill') as HTMLElement | null; if (enemyIni) enemyIni.style.width = (100-this.initiative) + '%';
  }

  private selectCombatTarget(target: 'head'|'torso'|'arms'|'legs') {
    this.combatTarget = target;
    document.querySelectorAll<HTMLButtonElement>('[data-hit-zone]').forEach(b => b.classList.toggle('selected', b.dataset.hitZone === target));
    const labels: Record<string,string> = {head:'Голова · высокий риск, критический урон',torso:'Корпус · надёжная цель',arms:'Конечности · ослабить атаку',legs:'Ноги · замедлить существо'};
    this.updateCombatHud(labels[target]);
  }

  private renderCombatWounds() {
    const host = document.getElementById('combatWounds'); if (!host) return;
    const labels: Record<string,string> = {arm:'Ранена рука: урон снижен',leg:'Ранена нога: уклонение сложнее',bleed:'Кровотечение: -2 HP за ход'};
    host.textContent = this.state.injuries.map(x => labels[x] || x).join(' · ') || 'ТЯЖЁЛЫХ РАН НЕТ';
  }

  private combatAction(action: 'attack'|'guard'|'item'|'noise'|'flee') {
    if (!document.getElementById('combatScreen')?.classList.contains('open') || this.dodgeReady) return;
    let log = '';
    if (action === 'flee') { this.state.health = Math.max(0, this.state.health - 5); this.finishCombat('Ты отступил, получив ранение.'); return; }
    if (action === 'attack') {
      const weaponDamage: Partial<Record<ItemId, number>> = { ryokan_key:7, wet_key_half:5, wet_key_other:5, ember_lantern:8, copper_bell:4, paper_lantern_shard:13, medicinal_herbs:2, stitched_mask:3 };
      const base = this.state.selected ? (weaponDamage[this.state.selected] ?? 10) : 8 + Math.floor(Math.random()*4);
      const armPenalty = this.state.injuries.includes('arm') ? 4 : 0;
      const accuracy: Record<string,number> = {head:.48,torso:.82,arms:.72,legs:.68};
      const hit = Math.random() < accuracy[this.combatTarget] - (this.state.injuries.includes('leg') ? .08 : 0);
      if (!hit) log = 'Ты промахнулся. Существо успело сместиться.';
      else {
        const critChance = this.combatTarget === 'head' ? .38 : .08;
        const critical = Math.random() < critChance;
        const zoneBonus: Record<string,number> = {head:critical?2.1:1.25,torso:1,arms:.72,legs:.82};
        const damage = Math.max(1,Math.round((base-armPenalty+(this.maskWorn?2:0))*zoneBonus[this.combatTarget]));
        this.monsterHp = Math.max(0,this.monsterHp-damage);
        log = (critical?'КРИТИЧЕСКИЙ УДАР! ':'') + this.combatTarget.toUpperCase() + ' · ' + damage + ' урона.';
        if (this.combatTarget === 'arms' && Math.random()<.55) { this.enemyArmsWeakened = true; log += ' Атака существа ослаблена.'; }
        if (this.combatTarget === 'legs' && Math.random()<.55) { this.enemyLegsSlowed = true; log += ' Существо замедлилось.'; }
        const art=document.getElementById('combatMonsterArt'); art?.classList.remove('hit'); void art?.clientWidth; art?.classList.add('hit'); setTimeout(()=>art?.classList.remove('hit'),360); simAudio.attack(this.state.muted);
      }
    } else if (action === 'guard') { this.guarding = true; this.initiative = Math.min(100,this.initiative+12); log = 'Ты закрываешься. Следующий удар будет слабее.'; }
    else if (action === 'item') {
      const id = this.state.selected;
      if (!id) { this.updateCombatHud('Выбери предмет в инвентаре, затем нажми ПРЕДМЕТ.'); return; }
      if (id === 'herbal_poultice') {
        this.state.health = Math.min(100, this.state.health + 22);
        this.state.injuries = this.state.injuries.filter(x => x !== 'bleed');
        log = 'Ты затянул рану повязкой. +22 HP · кровотечение остановлено.';
      } else if (id === 'warding_charm') {
        this.state.sanity = Math.min(100, this.state.sanity + 16);
        log = 'Оберег поглотил шёпот. +16 рассудка.';
      } else if (id === 'matchbox') {
        this.initiative = Math.min(100, this.initiative + 28);
        this.monsterHp = Math.max(0, this.monsterHp - 4);
        log = 'Вспышка спугнула существо. +28 инициативы · 4 урона.';
      } else if (id === 'ember_lantern') {
        this.monsterHp = Math.max(0, this.monsterHp - (this.threatKind === 'light' ? 2 : 14));
        this.initiative = Math.min(100, this.initiative + 18);
        log = this.threatKind === 'light' ? 'Слепой не боится света. Он бросается ближе.' : 'Пламя обжигает тварь. +18 инициативы.';
      } else if (id === 'stitched_mask') {
        this.state.sanity = Math.max(0, this.state.sanity - 6);
        this.monsterHp = Math.max(0, this.monsterHp - 12);
        log = 'Маска отвечает чужим голосом. Существо отшатывается, но рассудок -6.';
      } else {
        this.updateCombatHud('Этот предмет нельзя безопасно использовать в бою. Попробуй другой.'); return;
      }
      if (['herbal_poultice','warding_charm','matchbox'].includes(id)) this.state.inventory = this.state.inventory.filter(x => x !== id);
      this.state.selected = null;
      this.renderInv(); this.renderVitals();
    } else { this.noiseUntil=Date.now()+12000; this.monsterHp=Math.max(0,this.monsterHp-6); log='Резкий хлопок отвлёк существо. Но шум услышали в соседних комнатах.'; simAudio.impact(this.state.muted); }
    if (this.monsterHp<=0) { this.finishCombat('Существо рухнуло во тьму. Победа.'); return; }
    this.combatTurn++; this.initiative=Math.max(0,this.initiative-22);
    if (this.state.injuries.includes('bleed')) { this.state.health=Math.max(0,this.state.health-2); log+=' Кровь продолжает уходить: -2 HP.'; }
    this.renderVitals(); this.renderCombatWounds();
    this.updateCombatHud(log+' '+this.enemyAttackDescription());
    this.beginEnemyAttack(); saveState(this.state);
  }

  private enemyAttackDescription() {
    if (this.threatKind==='light') return 'Слепой собирается прыгнуть из темноты.';
    if (this.threatKind==='sound') return 'Слушатель накапливает звуковую волну.';
    return 'Жилец тянется к тебе длинными руками.';
  }

  private beginEnemyAttack() {
    this.dodgeReady=true;
    const dodge=document.getElementById('combatDodge') as HTMLButtonElement|null;
    if(dodge){dodge.disabled=false;dodge.classList.add('dodge-window');}
    const phase=document.getElementById('combatPhase'); if(phase) phase.textContent=this.threatKind==='light'?'ПРЫЖОК · УКЛОНИСЬ':this.threatKind==='sound'?'ЗВУКОВОЙ ИМПУЛЬС · ЗАЩИТИСЬ':'ЗАХВАТ · УКЛОНИСЬ';
    const art=document.getElementById('combatMonsterArt'); art?.classList.remove('attack'); void art?.clientWidth; art?.classList.add('attack');
    const windowMs=this.state.injuries.includes('leg')?680:this.enemyLegsSlowed?1550:this.threatKind==='light'?900:this.threatKind==='sound'?1250:1050;
    this.enemyAttackStartedAt = Date.now();
    this.enemyAttackWindowMs = windowMs;
    const bar=document.getElementById('enemyTelegraph') as HTMLElement|null; if(bar){bar.style.transition='none';bar.style.width='100%';requestAnimationFrame(()=>{bar.style.transition='width '+windowMs+'ms linear';bar.style.width='0%';});}
    simAudio.monster(this.state.muted);
    this.enemyTurnTimer=setTimeout(()=>this.resolveEnemyAttack(false),windowMs);
  }

  private combatDodge() {
    if (!this.dodgeReady) return;
    if (this.enemyTurnTimer) clearTimeout(this.enemyTurnTimer as number);
    const progress = Math.min(1, (Date.now() - this.enemyAttackStartedAt) / this.enemyAttackWindowMs);
    const perfect = progress >= .62 && progress <= .88;
    this.resolveEnemyAttack(perfect, perfect ? 'perfect' : progress < .62 ? 'early' : 'late');
  }

  private resolveEnemyAttack(evaded:boolean, timing: 'perfect'|'early'|'late' = 'late') {
    if(!this.dodgeReady)return;
    this.dodgeReady=false;
    const dodge=document.getElementById('combatDodge') as HTMLButtonElement|null;
    if(dodge){dodge.disabled=true;dodge.classList.remove('dodge-window');}
    const art=document.getElementById('combatMonsterArt'); art?.classList.remove('attack');
    let incoming=this.threatKind==='dweller'?17:this.threatKind==='light'?15:11;
    if (this.enemyArmsWeakened) incoming = Math.ceil(incoming * .55);
    let wound='';
    if(this.threatKind==='light'&&!evaded) wound='leg';
    if(this.threatKind==='sound'&&!evaded){this.state.sanity=Math.max(0,this.state.sanity-9);wound='arm';}
    if(this.threatKind==='dweller'&&!evaded) wound='bleed';
    const damage=evaded?0:this.guarding?Math.ceil(incoming*.28):timing === 'early' ? Math.ceil(incoming * .55) : timing === 'late' ? Math.ceil(incoming * .8) : incoming;
    this.guarding=false; this.enemyArmsWeakened=false; this.enemyLegsSlowed=false;
    if(!evaded){
      this.state.health=Math.max(0,this.state.health-damage);
      if(wound&&!this.state.injuries.includes(wound)){this.state.injuries.push(wound);}
      simAudio.impact(this.state.muted);
      document.body.classList.remove('player-hit');void document.body.clientWidth;document.body.classList.add('player-hit');setTimeout(()=>document.body.classList.remove('player-hit'),360);
    }else{simAudio.evade(this.state.muted);art?.classList.add('miss');setTimeout(()=>art?.classList.remove('miss'),380);this.initiative=Math.min(100,this.initiative+18);}
    this.renderVitals();this.renderCombatWounds();
    const detail=evaded?'ИДЕАЛЬНОЕ УКЛОНЕНИЕ · ты ушёл с линии атаки. Инициатива возвращается.':(timing === 'early' ? 'РАННЕЕ УКЛОНЕНИЕ · ' : 'НЕУДАЧНЫЙ РЫВОК · ')+'Удар достиг цели: -'+damage+' HP.'+(wound?' Получено состояние: '+wound+'.':'');
    this.updateCombatHud(detail);
    saveState(this.state);
    if(this.state.health<=0)this.finishCombat('Ты падаешь. Сознание гаснет…');
  }

  private applySanityTier(sanity: number) {
    const tier = sanity >= 65 ? 0 : sanity >= 45 ? 1 : sanity >= 25 ? 2 : 3;
    if (tier === this.sanityTier) return;
    this.sanityTier = tier;
    document.body.dataset.sanity = String(tier);
    document.body.classList.toggle('mind-frayed', tier >= 1);
    document.body.classList.toggle('mind-fractured', tier >= 2);
    document.body.classList.toggle('mind-collapse', tier >= 3);
    const voice = document.getElementById('innerVoice');
    if (voice) voice.textContent = tier === 0 ? 'Мысли ровные. Пока.' :
      tier === 1 ? 'Тени двигаются отдельно от предметов. Не смотри на них долго.' :
      tier === 2 ? 'Комната меняет размеры, когда мы моргаем. В кармане что-то шевелится.' :
      'Это не мой голос. Он говорит изо рта, которого здесь нет.';
    this.showSense('◉', tier === 0 ? 'Восприятие стабилизировалось.' : tier === 1 ? 'Краем глаза замечаешь движение.' : tier === 2 ? 'Контуры комнаты плывут.' : 'Ты слышишь чужой голос внутри головы.', tier > 0);
    if (tier >= 1) this.spawnMovingShadow();
    if (tier >= 2) { simAudio.whisper(this.state.muted); this.triggerImageDistortion(tier); }
    if (tier >= 3) { simAudio.maskWhisper(this.state.muted, 1.8); this.showFalseSilhouette(); this.mirrorInventory(); }
  }

  private triggerImageDistortion(tier: number) {
    document.body.classList.remove('hallucination-hit');
    void document.body.offsetWidth;
    document.body.classList.add('hallucination-hit');
    window.setTimeout(() => document.body.classList.remove('hallucination-hit'), tier >= 3 ? 1500 : 850);
  }

  private spawnMovingShadow() {
    if (document.body.classList.contains('combat-active') || this.threatActive) return;
    const shadow = document.createElement('div');
    shadow.className = 'sanity-shadow';
    shadow.setAttribute('aria-hidden','true');
    shadow.style.setProperty('--shadow-y', (12 + Math.random()*66) + '%');
    shadow.style.setProperty('--shadow-x', (8 + Math.random()*82) + '%');
    this.stage.appendChild(shadow);
    window.setTimeout(() => shadow.remove(), 4200);
  }

  private showFalseSilhouette() {
    if (document.getElementById('falsePresence')) return;
    const ghost = document.createElement('div');
    ghost.id = 'falsePresence';
    ghost.className = 'false-presence';
    ghost.setAttribute('aria-hidden','true');
    this.stage.appendChild(ghost);
    window.setTimeout(() => ghost.remove(), 2600);
  }

  private mirrorInventory() {
    const inv = document.getElementById('invSlots');
    if (!inv || document.getElementById('inventoryMirage')) return;
    const mirage = document.createElement('div');
    mirage.id = 'inventoryMirage';
    mirage.className = 'inventory-mirage';
    mirage.textContent = Math.random() > .5 ? 'ЭТО НЕ ТВОИ ВЕЩИ' : 'СЛОТЫ ПЕРЕСТАВЛЕНЫ';
    inv.appendChild(mirage);
    inv.classList.add('inventory-haunted');
    // Shuffle only the rendered slot nodes for a moment. The saved inventory array,
    // item counts and item identities remain untouched; renderInv restores the truth.
    const slots = Array.from(inv.children).filter((node): node is HTMLElement =>
      node instanceof HTMLElement && node.id !== 'inventoryMirage'
    );
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    slots.forEach(slot => inv.insertBefore(slot, mirage));
    window.setTimeout(() => {
      mirage.remove();
      inv.classList.remove('inventory-haunted');
      this.renderInv();
    }, 2800);
    // The actual inventory/state is never changed by a hallucination.
  }

  private startThreatApproach() {
    if (this.threatApproachTimer) clearInterval(this.threatApproachTimer as number);
    this.threatStartedAt = Date.now();
    const panel = document.getElementById('threatOverlay');
    if (!panel) return;
    let meter = document.getElementById('threatApproachMeter');
    if (!meter) {
      meter = document.createElement('div');
      meter.id = 'threatApproachMeter';
      meter.className = 'threat-approach-meter';
      meter.innerHTML = '<div class="threat-approach-label"><span>ДИСТАНЦИЯ ДО СУЩЕСТВА</span><b id="threatApproachTime">08.0</b></div><div class="threat-approach-track"><i id="threatApproachFill"></i></div>';
      panel.querySelector('.threat-copy')?.appendChild(meter);
    }
    const duration = this.threatKind === 'light' ? 10500 : this.threatKind === 'sound' ? 9000 : 8200;
    const tick = () => {
      if (!this.threatActive) return;
      const progress = Math.min(1, (Date.now()-this.threatStartedAt)/duration);
      const fill = document.getElementById('threatApproachFill') as HTMLElement|null;
      const time = document.getElementById('threatApproachTime');
      if (fill) fill.style.width = (progress*100)+'%';
      if (time) time.textContent = Math.max(0,(duration-(Date.now()-this.threatStartedAt))/1000).toFixed(1);
      const creature = document.getElementById('sceneCreature');
      if (creature) {
        creature.style.setProperty('--approach', String(progress));
        creature.classList.toggle('closing-in', progress > .35);
      }
      this.setAwareness(progress > .76 ? 'seen' : progress > .24 ? 'suspected' : 'hidden');
      panel.style.setProperty('--threat-progress', String(progress));
      if (progress >= 1) {
        clearInterval(this.threatApproachTimer as number);
        this.threatApproachTimer = 0;
        this.showSense('◉','Оно уже слишком близко.',true);
        simAudio.monster(this.state.muted);
        this.startCombat();
      }
    };
    tick();
    this.threatApproachTimer = window.setInterval(tick, 90);
  }

  private startSanityDistortions() {
    if (this.hallucinationTimer) clearInterval(this.hallucinationTimer as number);
    this.hallucinationTimer = setInterval(() => {
      const sanity = Math.max(0, Math.min(100, this.state.sanity ?? 100));
      if (sanity >= 65 || this.threatActive || document.getElementById('combatScreen')?.classList.contains('open')) return;
      const tier = sanity >= 45 ? 1 : sanity >= 25 ? 2 : 3;
      // Hallucinations recur while sanity is low; they remain visual/audio-only.
      if (Math.random() < (tier === 1 ? .24 : tier === 2 ? .42 : .68)) this.spawnMovingShadow();
      if (tier >= 2 && Math.random() < (tier === 2 ? .16 : .34)) {
        this.showFalseSilhouette();
        simAudio.whisper(this.state.muted);
      }
      if (tier === 3 && Math.random() < .22) this.mirrorInventory();
      const thoughts = tier === 1
        ? ['Не оборачивайся. Там просто дождь.', 'Шаги повторяют твой темп.', 'На секунду показалось, что фонарь погас.']
        : tier === 2
        ? ['Дверь была дальше. Почему она ближе?', 'Кто-то произнёс твоё имя изнутри стены.', 'Предмет в кармане кажется тёплым.']
        : ['Это не выход. Это воспоминание о выходе.', 'Не доверяй силуэтам. Один из них — твой.', 'Ты забыл, сколько пальцев на руке.'];
      const line = thoughts[this.thoughtIndex++ % thoughts.length];
      const voice = document.getElementById('innerVoice');
      if (voice) voice.textContent = line;
      this.showSense('◉', line, true);
      if (tier >= 2 && Math.random() < (tier === 2 ? .42 : .72)) {
        document.body.classList.remove('hallucination-hit');
        void document.body.clientWidth;
        document.body.classList.add('hallucination-hit');
        setTimeout(() => document.body.classList.remove('hallucination-hit'), 900);
      }
      if (tier === 2 && Math.random() < .22) {
        this.showFalseSilhouette();
        simAudio.whisper(this.state.muted);
      }
      if (tier === 3 && Math.random() < .5) {
        const caption = document.getElementById('soundCaption');
        if (caption) caption.textContent = 'ТВОЙ ГОЛОС · позади';
        simAudio.maskWhisper(this.state.muted, 1.35);
        // A brief false silhouette: visual only, never starts combat or deals damage.
        if (!document.getElementById('falsePresence')) {
          const ghost = document.createElement('div');
          ghost.id = 'falsePresence';
          ghost.className = 'false-presence';
          ghost.setAttribute('aria-hidden', 'true');
          this.stage.appendChild(ghost);
          setTimeout(() => ghost.remove(), 1800);
        }
      }
    }, 7200);
  }

  private tickMaskEffects() {
    if (!this.maskWorn) { this.maskLastTick = Date.now(); return; }
    if (Date.now() - this.maskLastTick < 20000) return;
    this.maskLastTick = Date.now();
    this.state.maskExposure = (this.state.maskExposure || 0) + 1;
    const exposure = this.state.maskExposure;
    if (exposure % 2 === 0) this.state.sanity = Math.max(0, this.state.sanity - 1);
    if (exposure === 3) { this.showSense('◉','Ты слышишь своё дыхание не изнутри, а рядом.',true); simAudio.maskWhisper(this.state.muted,1); this.notify('Маска запоминает твой голос.','warn'); }
    else if (exposure === 6) { this.showSense('◉','На секунду мир выглядит чужими глазами.',true); this.state.sanity = Math.max(0,this.state.sanity-5); simAudio.heartbeat(this.state.muted); this.notify('Маска начинает менять восприятие.','warn'); }
    else if (exposure >= 10 && exposure % 4 === 2) { this.state.sanity = Math.max(0,this.state.sanity-3); this.state.health = Math.max(1,this.state.health-2); this.showSense('◉','Нити маски впиваются в кожу под глазами.',true); simAudio.maskWhisper(this.state.muted,1.8); }
    saveState(this.state); this.renderVitals();
  }

  private finishCombat(message: string) {
    if (this.enemyTurnTimer) clearTimeout(this.enemyTurnTimer as number);
    this.dodgeReady = false;
    document.getElementById('combatScreen')?.classList.remove('open');
    document.getElementById('combatScreen')?.setAttribute('aria-hidden','true');
    document.body.classList.remove('combat-active');
    document.getElementById('sceneCreature')?.remove();
    this.threatCooldown = Date.now()+45000;
    this.state.sanity = Math.max(0,this.state.sanity-4);
    saveState(this.state); this.renderVitals(); this.renderInv();
    this.notify(message, this.state.health > 0 ? 'warn' : 'info');
    this.showSense('◉',message,true);
    this.pulseMatrix('alert');
  }

  private useSelectedItem() {
    const id = this.state.selected;
    if (!id) { this.notify('Сначала выбери предмет в инвентаре', 'warn'); return; }
    const effects: Partial<Record<ItemId, { field: 'health' | 'sanity'; amount: number; message: string }>> = {
      herbal_poultice: { field: 'health', amount: 25, message: 'Ты перевязал рану. Боль отступает.' },
      warding_charm: { field: 'sanity', amount: 20, message: 'Оберег холодеет в ладони. Мысли становятся яснее.' },
      ember_lantern: { field: 'sanity', amount: 12, message: 'Маленький огонь отгоняет навязчивый шёпот.' },
    };
    if (id === 'stitched_mask') { this.maskWorn = !this.maskWorn; document.body.classList.toggle('mask-worn', this.maskWorn); this.state.maskWorn = this.maskWorn; this.state.maskExposure = Math.max(0,this.state.maskExposure || 0); this.maskLastTick = Date.now(); this.state.sanity = Math.max(0, Math.min(100, this.state.sanity + (this.maskWorn ? -7 : 2))); saveState(this.state); this.notify(this.maskWorn ? 'Ты надел маску. Слепой хуже различает твой силуэт, но маска начинает запоминать тебя.' : 'Ты снял маску. Шёпот стих, но на внутренней стороне проступило твоё имя.', this.maskWorn ? 'warn' : 'ok'); this.showSense('◉', this.maskWorn ? 'Маска надета · воздействие нарастает' : 'Маска снята · влияние ослабевает', this.maskWorn); simAudio.maskWhisper(this.state.muted, this.maskWorn ? 1.2 : .5); this.makeNoise('Ткань и бумага шуршат у лица.'); this.renderVitals(); return; }
    if (id === 'ember_lantern') { this.lightActive = !this.lightActive; this.noiseUntil = Date.now() + 7000; this.notify(this.lightActive ? 'Фонарь зажжён. Свет виден издалека.' : 'Ты погасил фонарь.', this.lightActive ? 'warn' : 'ok'); this.showSense('☼', this.lightActive ? 'Источник света активен' : 'Свет погашен', this.lightActive); simAudio.click(this.state.muted); return; }
    const effect = effects[id];
    if (!effect) {
      this.notify('Выбери объект сцены и нажми на него, чтобы применить предмет.', 'info');
      return;
    }
    const before = this.state[effect.field];
    this.state[effect.field] = Math.min(100, before + effect.amount);
    if (this.state[effect.field] === before) {
      this.notify('Сейчас это не требуется.', 'info');
      return;
    }
    this.state.inventory = this.state.inventory.filter((item) => item !== id);
    this.state.selected = null;
    saveState(this.state);
    simAudio.take(this.state.muted);
    this.notify(effect.message, 'ok');
    this.renderInv();
    this.renderVitals();
  }

  private onInv(id: ItemId) {
    simAudio.click(this.state.muted);
    this.makeNoise('Ты пошевелил предметы в инвентаре.');
    const caption = document.getElementById('soundCaption'); if (caption) caption.textContent = 'Шорох… (рядом)';
    if (this.state.selected && this.state.selected !== id) {
      const recipe = RECIPES.find(
        (r) =>
          (r.a === this.state.selected && r.b === id) ||
          (r.b === this.state.selected && r.a === id)
      );
      if (recipe) {
        this.state.inventory = this.state.inventory.filter((x) => x !== recipe.a && x !== recipe.b);
        if (!this.state.inventory.includes(recipe.result)) this.state.inventory.push(recipe.result);
        this.state.selected = recipe.result;
        saveState(this.state);
        simAudio.combine(this.state.muted);
        this.notify(recipe.message, 'ok');
        this.pulseMatrix('ok');
        this.renderInv();
        return;
      }
    }
    this.state.selected = this.state.selected === id ? null : id;
    saveState(this.state);
    this.renderInv();
  }

  private openItemExam(id: ItemId) {
    const def = ITEMS[id];
    const modal = document.getElementById('simModal')!;
    document.getElementById('modalTitle')!.textContent = def.name;
    const visual = document.getElementById('modalVisual');
    if (visual) visual.innerHTML = `<img class="item-art-image" src="${this.itemAsset(id)}" alt="${def.name}">`;
    const examBody = document.getElementById('modalBody')!;
    examBody.textContent = def.name + '\n\n' + def.examine;
    examBody.classList.remove('thought-text');
    const actions = document.getElementById('modalActions')!;
    actions.innerHTML = '';
    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = 'ЗАКРЫТЬ';
    close.onclick = () => this.closeModal();
    actions.appendChild(close);
    modal.classList.toggle('risk-modal', id === 'black_seed' || id === 'stitched_mask');
    modal.classList.add('open');
    simAudio.open(this.state.muted);
  }

  private renderMinimap() {
    const mm = document.getElementById('miniMap');
    if (!mm) return;
    mm.innerHTML = '<div class="mm-title">КАРТА</div>';
    const graph = document.createElement('div');
    graph.className = 'mm-graph';
    // progressive draw: only visited + edges between consecutive visited
    LOCATION_ORDER.forEach((id, idx) => {
      const vis = this.state.visited.includes(id);
      const cur = this.state.location === id;
      if (idx > 0) {
        const prev = LOCATION_ORDER[idx - 1];
        const edgeOn = this.state.visited.includes(prev) && vis;
        const edge = document.createElement('div');
        edge.className = 'mm-edge' + (edgeOn ? ' on' : '');
        graph.appendChild(edge);
      }
      const n = document.createElement('button');
      n.type = 'button';
      n.className = 'mm-n' + (vis ? ' vis' : '') + (cur ? ' cur' : '');
      n.textContent = vis ? LOCATIONS[id].title : '· · ·';
      n.disabled = !vis;
      if (vis) {
        n.style.animationDelay = idx * 0.06 + 's';
        n.classList.add('mm-draw');
      }
      n.addEventListener('click', () => {
        if (vis && id !== this.state.location) void this.go(id);
      });
      graph.appendChild(n);
    });
    mm.appendChild(graph);
  }
}
