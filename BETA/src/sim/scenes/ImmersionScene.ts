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
  private diving = true;

  constructor() {
    this.state = loadState();
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
    this.renderMinimap();
    this.updateZone();
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
    document.getElementById('btnUseItem')?.addEventListener('click', () => {
      if (!this.state.selected) { this.notify('Выбери предмет, который хочешь применить', 'warn'); return; }
      this.notify('Предмет готов. Выбери объект или точку взаимодействия в сцене.', 'info');
      this.pulseMatrix('ok');
    });
    document.getElementById('modalClose')?.addEventListener('click', () => this.closeModal());
    document.getElementById('modalBackdrop')?.addEventListener('click', () => this.closeModal());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
    window.addEventListener('pointerdown', () => simAudio.unlock(), { once: true });
  }

  private scheduleEvents() {
    if (this.eventTimer) clearInterval(this.eventTimer as number);
    this.eventTimer = setInterval(() => {
      const loc = this.state.location;
      if ((loc === 'garden' || loc === 'engawa') && Math.random() > 0.45) {
        simAudio.steps(this.state.muted);
        this.notify('Сверху — шаги. Доски не должны так звучать.', 'warn');
        this.pulseMatrix('alert');
        this.state.flags.heard_steps = true;
        this.state.sanity = Math.max(0, this.state.sanity - 4);
        saveState(this.state);
        this.renderVitals();
      }
    }, 40000);
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
    n.textContent = msg;
    host.appendChild(n);
    requestAnimationFrame(() => n.classList.add('show'));
    setTimeout(() => {
      n.classList.remove('show');
      setTimeout(() => n.remove(), 400);
    }, 3200);
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
    this.state.location = to;
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
    const modal = document.getElementById('simModal')!;
    document.getElementById('modalTitle')!.textContent = hs.label;
    const body = document.getElementById('modalBody')!;
    const visual = document.getElementById('modalVisual');
    if (visual) {
      if (hs.item) visual.innerHTML = itemSvgMarkup(hs.item, 96);
      else if (hs.complete)
        visual.innerHTML = `<svg viewBox="0 0 64 64" width="96" height="96"><rect x="16" y="16" width="32" height="32" fill="none" stroke="#1ec99a" stroke-width="2"/><text x="32" y="38" text-anchor="middle" fill="#1ec99a" font-size="10" font-family="monospace">RK-01</text></svg>`;
      else visual.innerHTML = '';
    }
    body.textContent = hs.examine;
    const actions = document.getElementById('modalActions')!;
    actions.innerHTML = '';

    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = 'ЗАКРЫТЬ';
    close.onclick = () => this.closeModal();
    actions.appendChild(close);

    if (hs.item && hs.takenFlag && !this.state.flags[hs.takenFlag]) {
      const take = document.createElement('button');
      take.className = 'btn solid';
      take.textContent = 'ВЗЯТЬ';
      take.onclick = () => {
        if (!this.state.inventory.includes(hs.item!)) this.state.inventory.push(hs.item!);
        this.state.flags[hs.takenFlag!] = true;
        saveState(this.state);
        simAudio.take(this.state.muted);
        this.notify('Получено: ' + ITEMS[hs.item!].name, 'ok');
        this.pulseMatrix('ok');
        this.closeModal();
        this.buildHotspots();
        this.renderInv();
      };
      actions.appendChild(take);
    }

    if (hs.complete) {
      const win = document.createElement('button');
      win.className = 'btn solid';
      win.textContent = 'СТАБИЛИЗИРОВАТЬ';
      win.onclick = () => {
        this.state.completed = true;
        saveState(this.state);
        markSceneDone();
        simAudio.complete(this.state.muted);
        this.notify('Сектор стабилизирован · Сцена 01', 'ok');
        this.pulseMatrix('ok');
        this.closeModal();
        setTimeout(() => {
          window.location.href = '/scene-ryokan.html';
        }, 1600);
      };
      actions.appendChild(win);
    }

    modal.classList.add('open');
    simAudio.open(this.state.muted);
  }

  private closeModal() {
    document.getElementById('simModal')?.classList.remove('open');
  }

  private renderInv() {
    this.invEl.innerHTML = '';
    const count = document.getElementById('inventoryCount');
    if (count) count.textContent = this.state.inventory.length + ' / 8';
    if (!this.state.inventory.length) {
      this.invEl.innerHTML = '<div class="inv-empty">ИНВЕНТАРЬ ПУСТ</div>';
      this.syncHand();
      return;
    }
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
  }

  private syncHand() {
    const sel = document.getElementById('handLabel');
    if (!sel) return;
    sel.textContent = this.state.selected
      ? 'В РУКАХ: ' + ITEMS[this.state.selected].name
      : 'В РУКАХ: —';
  }

  private onInv(id: ItemId) {
    simAudio.click(this.state.muted);
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
    if (visual) visual.innerHTML = itemSvgMarkup(id, 96);
    document.getElementById('modalBody')!.textContent = def.examine;
    const actions = document.getElementById('modalActions')!;
    actions.innerHTML = '';
    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = 'ЗАКРЫТЬ';
    close.onclick = () => this.closeModal();
    actions.appendChild(close);
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
