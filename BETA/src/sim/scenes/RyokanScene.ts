import {
    LOCATIONS,
    LOCATION_ORDER,
    MAP_EDGES,
    type LocationId,
    type LocationDef,
  } from '../data/ryokan/locations';
  import { hotspotsFor, type HotspotDef } from '../data/ryokan/hotspots';
  import { ITEMS, tryCombine, type ItemId } from '../state/Inventory';
  import {
    loadState,
    saveState,
    addItem,
    removeItems,
    setFlag,
    visit,
    hasItem,
    type SimState,
  } from '../state/GameState';
  import { ParallaxController } from '../systems/Parallax';
  import { simAudio } from '../audio/SimAudio';
  import { setSceneDone } from '../../core/progress';
  
  type ModalMode = 'examine' | 'complete' | null;
  
  export class RyokanScene {
    private state: SimState;
    private parallax: ParallaxController | null = null;
    private modalMode: ModalMode = null;
    private modalHotspot: HotspotDef | null = null;
    private eventTimer = 0 as number | ReturnType<typeof setInterval>;
  
    private el = {
      stage: document.getElementById('sim-stage')!,
      layers: document.getElementById('sim-layers')!,
      hotspots: document.getElementById('sim-hotspots')!,
      exits: document.getElementById('sim-exits')!,
      title: document.getElementById('sim-zone-title')!,
      sub: document.getElementById('sim-zone-sub')!,
      hint: document.getElementById('sim-hint')!,
      inv: document.getElementById('sim-inv')!,
      toast: document.getElementById('sim-toast')!,
      modal: document.getElementById('sim-modal')!,
      modalTitle: document.getElementById('sim-modal-title')!,
      modalBody: document.getElementById('sim-modal-body')!,
      modalActions: document.getElementById('sim-modal-actions')!,
      minimap: document.getElementById('sim-minimap')!,
      selected: document.getElementById('sim-selected')!,
      eyes: document.getElementById('sim-eyes')!,
    };
  
    constructor() {
      this.state = loadState();
      if (this.state.completed) {
        // allow replay from storage room still
      }
    }
  
    start() {
      simAudio.unlock();
      this.bindUi();
      this.renderAll();
      this.scheduleAmbientEvents();
      this.el.hint.textContent = 'Кликай по подсвеченным зонам · ПКМ по предмету в инвентаре — осмотр';
    }
  
    private bindUi() {
      document.getElementById('sim-btn-mute')?.addEventListener('click', () => {
        simAudio.setMuted(!simAudio.muted);
        const b = document.getElementById('sim-btn-mute');
        if (b) b.textContent = simAudio.muted ? 'SFX · OFF' : 'SFX · ON';
        if (!simAudio.muted) {
          const loc = LOCATIONS[this.state.location];
          simAudio.startAmbient(loc.ambient);
        }
      });
  
      document.getElementById('sim-btn-reset')?.addEventListener('click', () => {
        if (!confirm('Сбросить прогресс симуляции Рёкана?')) return;
        localStorage.removeItem('limbo_sim_ryokan_v1');
        this.state = loadState();
        this.renderAll();
        this.toast('Симуляция сброшена', false);
      });
  
      document.getElementById('sim-modal-close')?.addEventListener('click', () => this.closeModal());
      this.el.modal.addEventListener('click', (e) => {
        if (e.target === this.el.modal) this.closeModal();
      });
  
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeModal();
      });
  
      // rare eyes blink in dark
      setInterval(() => this.pulseEyes(), 12000 + Math.random() * 8000);
    }
  
    private pulseEyes() {
      const eyes = this.el.eyes;
      if (!eyes) return;
      eyes.classList.add('on');
      setTimeout(() => eyes.classList.remove('on'), 900 + Math.random() * 600);
    }
  
    private scheduleAmbientEvents() {
      if (this.eventTimer) clearInterval(this.eventTimer as number);
      this.eventTimer = setInterval(() => {
        if (this.modalMode) return;
        const loc = this.state.location;
        if (loc === 'garden' || loc === 'engawa') {
          if (Math.random() > 0.55) {
            simAudio.steps();
            this.toast('Где-то сверху — шаги. Доски не должны так звучать.', true);
            this.state = setFlag(this.state, 'heard_steps');
            saveState(this.state);
          }
        }
      }, 48000);
    }
  
    private toast(msg: string, warn = false) {
      const t = this.el.toast;
      t.textContent = msg;
      t.classList.toggle('warn', warn);
      t.classList.add('show');
      clearTimeout((t as unknown as { _tm: number })._tm);
      (t as unknown as { _tm: number })._tm = window.setTimeout(() => t.classList.remove('show'), 3200);
    }
  
    private persist() {
      saveState(this.state);
    }
  
    private renderAll() {
      this.renderLocation();
      this.renderInventory();
      this.renderMinimap();
      this.updateSelectedLabel();
    }
  
    private renderLocation() {
      const loc = LOCATIONS[this.state.location];
      this.el.title.textContent = loc.title;
      this.el.sub.textContent = loc.subtitle;
  
      // layers
      this.el.layers.innerHTML = '';
      const layerNodes: { el: HTMLElement; depth: number }[] = [];
      loc.layers.forEach((L, i) => {
        const d = document.createElement('div');
        d.className = 'sim-layer';
        d.style.background = L.gradient;
        d.style.zIndex = String(i);
        if (L.label) d.dataset.label = L.label;
        this.el.layers.appendChild(d);
        layerNodes.push({ el: d, depth: L.depth });
      });
  
      // vignette
      this.el.stage.style.setProperty('--vig', loc.vignette);
  
      if (this.parallax) this.parallax.destroy();
      this.parallax = new ParallaxController(this.el.stage);
      this.parallax.setLayers(layerNodes);
  
      simAudio.startAmbient(loc.ambient);
  
      // hotspots
      this.el.hotspots.innerHTML = '';
      for (const hs of hotspotsFor(loc.id)) {
        if (hs.hideWhenFlag && this.state.flags[hs.hideWhenFlag]) continue;
        if (hs.useFlag && this.state.flags[hs.useFlag] && hs.id === 'hs_genkan_door') {
          // door unlocked — still show but as open marker
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `sim-hotspot cursor-${hs.cursor}`;
        b.style.left = hs.x + '%';
        b.style.top = hs.y + '%';
        b.style.width = hs.w + '%';
        b.style.height = hs.h + '%';
        b.innerHTML = `<span class="hs-label">${hs.label}</span>`;
        b.title = hs.label;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          simAudio.click();
          this.onHotspot(hs);
        });
        b.addEventListener('mouseenter', () => {
          this.el.hint.textContent = `${hs.label} · ${hs.cursor === 'hand' ? 'осмотреть / взять' : hs.cursor === 'door' ? 'дверь' : 'осмотреть'}`;
        });
        this.el.hotspots.appendChild(b);
      }
  
      // exits
      this.el.exits.innerHTML = '';
      for (const ex of loc.exits) {
        const lockedItem = ex.needsItem && !hasItem(this.state, ex.needsItem as ItemId);
        const lockedFlag = ex.needsFlag && !this.state.flags[ex.needsFlag];
        // door to genkan: also allow if door_unlocked
        let blocked = !!(lockedItem || lockedFlag);
        if (ex.to === 'genkan' && this.state.flags.door_unlocked) blocked = false;
        if (ex.needsItem === 'ryokan_key' && this.state.flags.door_unlocked) blocked = false;
  
        const a = document.createElement('button');
        a.type = 'button';
        a.className = 'sim-exit' + (blocked ? ' locked' : '');
        a.style.left = ex.x + '%';
        a.style.top = ex.y + '%';
        a.textContent = blocked ? '🔒 ' + ex.label : ex.label;
        a.addEventListener('click', () => {
          if (blocked) {
            simAudio.deny();
            this.toast(ex.blockedText || 'Путь закрыт', true);
            return;
          }
          simAudio.click();
          this.go(ex.to);
        });
        this.el.exits.appendChild(a);
      }
    }
  
    private go(to: LocationId) {
      this.el.stage.classList.add('fade');
      setTimeout(() => {
        this.state = visit(this.state, to);
        this.persist();
        this.renderLocation();
        this.renderMinimap();
        this.el.stage.classList.remove('fade');
      }, 280);
    }
  
    private onHotspot(hs: HotspotDef) {
      // use selected item on hotspot
      if (this.state.selectedItem && hs.useWith?.length) {
        if (hs.useWith.includes(this.state.selectedItem)) {
          this.applyUse(hs, this.state.selectedItem);
          return;
        }
        simAudio.deny();
        this.toast(hs.useFail || 'Это сюда не подходит', true);
        return;
      }
  
      if (hs.complete) {
        this.openComplete(hs);
        return;
      }
  
      this.openExamine(hs);
    }
  
    private openExamine(hs: HotspotDef) {
      this.modalMode = 'examine';
      this.modalHotspot = hs;
      this.el.modalTitle.textContent = hs.label;
      this.el.modalBody.innerHTML = `<p class="exam-text">${hs.examine}</p>`;
      this.el.modalActions.innerHTML = '';
  
      const close = document.createElement('button');
      close.className = 'btn';
      close.textContent = 'ЗАКРЫТЬ';
      close.onclick = () => this.closeModal();
      this.el.modalActions.appendChild(close);
  
      if (hs.item && hs.takenFlag && !this.state.flags[hs.takenFlag]) {
        const take = document.createElement('button');
        take.className = 'btn solid';
        take.textContent = 'ВЗЯТЬ';
        take.onclick = () => {
          this.state = addItem(this.state, hs.item!);
          this.state = setFlag(this.state, hs.takenFlag!);
          this.persist();
          simAudio.take();
          this.toast(`Получено: ${ITEMS[hs.item!].name}`);
          this.closeModal();
          this.renderAll();
        };
        this.el.modalActions.appendChild(take);
      }
  
      this.el.modal.classList.add('open');
    }
  
    private applyUse(hs: HotspotDef, item: ItemId) {
      if (hs.useFlag) this.state = setFlag(this.state, hs.useFlag);
      // don't consume key for door
      this.state = { ...this.state, selectedItem: null };
      this.persist();
      simAudio.door();
      this.toast(hs.useSuccess || 'Сработало');
      this.renderAll();
    }
  
    private openComplete(hs: HotspotDef) {
      this.modalMode = 'complete';
      this.el.modalTitle.textContent = hs.label;
      this.el.modalBody.innerHTML = `<p class="exam-text">${hs.examine}</p>
        <p class="exam-text cyan">Стабилизация канала вернёт тебя в архив с пометкой «Сцена 01 пройдена».</p>`;
      this.el.modalActions.innerHTML = '';
      const cancel = document.createElement('button');
      cancel.className = 'btn';
      cancel.textContent = 'ЕЩЁ ПОИСКАТЬ';
      cancel.onclick = () => this.closeModal();
      const win = document.createElement('button');
      win.className = 'btn solid';
      win.textContent = 'СТАБИЛИЗИРОВАТЬ КАНАЛ';
      win.onclick = () => this.finish();
      this.el.modalActions.appendChild(cancel);
      this.el.modalActions.appendChild(win);
      this.el.modal.classList.add('open');
    }
  
    private finish() {
      this.state = { ...this.state, completed: true };
      this.persist();
      try {
        setSceneDone(1);
      } catch { /* */ }
      simAudio.complete();
      this.closeModal();
      this.toast('Сектор Рёкан стабилизирован. Сцена 01 отмечена.');
      setTimeout(() => {
        window.location.href = 'scene-ryokan.html';
      }, 1800);
    }
  
    private closeModal() {
      this.modalMode = null;
      this.modalHotspot = null;
      this.el.modal.classList.remove('open');
    }
  
    private renderInventory() {
      this.el.inv.innerHTML = '';
      if (this.state.inventory.length === 0) {
        this.el.inv.innerHTML = '<div class="inv-empty">ИНВЕНТАРЬ ПУСТ · ИЩИ НА ЛОКАЦИЯХ</div>';
        return;
      }
      for (const id of this.state.inventory) {
        const def = ITEMS[id];
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className =
          'inv-slot' +
          (this.state.selectedItem === id ? ' selected' : '') +
          (this.state.combineSlot === id ? ' combine' : '');
        slot.innerHTML = `<span class="ic" style="color:${def.color}">${def.icon}</span><span class="nm">${def.short}</span>`;
        slot.title = def.name + ' · ЛКМ выбрать/комбинировать · ПКМ осмотр';
  
        slot.addEventListener('click', () => this.onInvClick(id));
        slot.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.examineItem(id);
        });
        this.el.inv.appendChild(slot);
      }
    }
  
    private onInvClick(id: ItemId) {
      simAudio.click();
      // combine flow: if one selected and click another → try recipe
      if (this.state.selectedItem && this.state.selectedItem !== id) {
        const recipe = tryCombine(this.state.selectedItem, id);
        if (recipe) {
          this.state = removeItems(this.state, [recipe.a, recipe.b]);
          this.state = addItem(this.state, recipe.result);
          this.state = { ...this.state, selectedItem: recipe.result, combineSlot: null };
          this.persist();
          simAudio.combine();
          this.toast(recipe.message);
          this.renderInventory();
          this.updateSelectedLabel();
          return;
        }
        // switch selection if no recipe
        this.state = { ...this.state, selectedItem: id };
        this.persist();
        this.renderInventory();
        this.updateSelectedLabel();
        this.toast('Не комбинируется. Предмет выбран для использования на объекте.');
        return;
      }
      // toggle select
      this.state = {
        ...this.state,
        selectedItem: this.state.selectedItem === id ? null : id,
      };
      this.persist();
      this.renderInventory();
      this.updateSelectedLabel();
    }
  
    private examineItem(id: ItemId) {
      const def = ITEMS[id];
      this.el.modalTitle.textContent = def.name;
      this.el.modalBody.innerHTML = `<p class="exam-text">${def.examine}</p>`;
      this.el.modalActions.innerHTML = '';
      const close = document.createElement('button');
      close.className = 'btn';
      close.textContent = 'ЗАКРЫТЬ';
      close.onclick = () => this.closeModal();
      this.el.modalActions.appendChild(close);
      this.el.modal.classList.add('open');
    }
  
    private updateSelectedLabel() {
      const el = this.el.selected;
      if (!el) return;
      if (!this.state.selectedItem) {
        el.textContent = 'В РУКАХ: —';
        return;
      }
      el.textContent = 'В РУКАХ: ' + ITEMS[this.state.selectedItem].name;
    }
  
    private renderMinimap() {
      const mm = this.el.minimap;
      mm.innerHTML = '<div class="mm-title">КАРТА СЕКТОРА</div>';
      const graph = document.createElement('div');
      graph.className = 'mm-graph';
  
      // simple vertical flow
      const positions: Record<LocationId, { x: number; y: number }> = {
        gate: { x: 20, y: 8 },
        garden: { x: 20, y: 28 },
        engawa: { x: 20, y: 48 },
        genkan: { x: 55, y: 48 },
        hall: { x: 55, y: 68 },
        storage: { x: 55, y: 88 },
      };
  
      // edges
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.classList.add('mm-edges');
      for (const [a, b] of MAP_EDGES) {
        const known = this.state.visited.includes(a) && this.state.visited.includes(b);
        if (!known) continue;
        const pa = positions[a];
        const pb = positions[b];
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(pa.x + 8));
        line.setAttribute('y1', String(pa.y + 4));
        line.setAttribute('x2', String(pb.x + 8));
        line.setAttribute('y2', String(pb.y + 4));
        line.setAttribute('stroke', 'rgba(0,212,232,0.35)');
        line.setAttribute('stroke-width', '0.6');
        svg.appendChild(line);
      }
      graph.appendChild(svg);
  
      for (const id of LOCATION_ORDER) {
        const visited = this.state.visited.includes(id);
        const current = this.state.location === id;
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'mm-node' + (visited ? ' vis' : '') + (current ? ' cur' : '');
        node.style.left = positions[id].x + '%';
        node.style.top = positions[id].y + '%';
        node.textContent = visited ? LOCATIONS[id].title.split(' ')[0] : '· · ·';
        node.disabled = !visited;
        node.addEventListener('click', () => {
          if (!visited || id === this.state.location) return;
          // free travel only to visited (detective convenience)
          simAudio.click();
          this.go(id);
        });
        graph.appendChild(node);
      }
      mm.appendChild(graph);
    }
  }
  