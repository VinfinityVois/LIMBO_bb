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
import { loadCampaignArchive, recordCampaignSector } from '../state/CampaignProgress';

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
  private matrixTimer = 0 as ReturnType<typeof setInterval> | number;
  private worldClockTimer = 0 as ReturnType<typeof setInterval> | number;
  private threatActive = false;
  private threatCooldown = 0;
  private threatKind: 'light' | 'sound' | 'dweller' = 'dweller';
  private roomEnteredAt = Date.now();
  private lightActive = false;
  private noiseUntil = 0;
  private monsterHp = 42;
  private monsterMaxHp = 42;
  private monsterName = 'КИДЗЁ';
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
  private soundUiTimer: ReturnType<typeof setInterval> | number = 0;
  private noiseStartedAt = 0;
  private noiseDuration = 0;
  private noisePeak = 0;
  private noiseEncounterPending = false;
  private noiseEncounterExpiresAt = 0;
  private currentSoundLevel = 3;
  private notificationQueue: Array<{ message: string; kind: 'info' | 'warn' | 'ok' }> = [];
  private notificationBusy = false;
  private lastNotification = '';
  private lastNotificationAt = 0;
  private spiderStage = 0;
  private spiderNextAt = Date.now() + 16000;
  private spiderDialogTimer: ReturnType<typeof setTimeout> | number = 0;
  private spiderInCombat = false;
  private transitionBusy = false;
  private recoveryFrame = 0;
  private interfaceWatchdogTimer = 0 as ReturnType<typeof setInterval> | number;
  private lastSanityExposureAt = Date.now();

  constructor() {
    this.state = loadState();
    // Migrate progress from the earlier anchor interaction so existing saves do not become stuck.
    if (this.state.flags.anchor_warned) this.state.flags.anchor_step_bell = true;
    if (this.state.flags.anchor_warded) this.state.flags.anchor_step_charm = true;
    if (this.state.flags.anchor_lit) this.state.flags.anchor_step_lantern = true;
    if (this.state.flags.anchor_step_bell && this.state.flags.anchor_step_charm && this.state.flags.anchor_step_lantern) this.state.flags.anchor_puzzle_solved = true;
    if (this.state.flags.anchor_puzzle_solved) this.state.flags.anchor_exit_unlocked = true;
    saveState(this.state);
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
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      this.parallax.setMouse(nx, ny);
      this.stage.querySelectorAll<HTMLElement>('.hotspot, .exit-btn').forEach((node) => {
        const depth = node.classList.contains('door') ? 1.2 : node.classList.contains('loot') ? 0.85 : 0.65;
        node.style.translate = `${nx * 22 * depth}px ${ny * 15 * depth}px`;
      });
      // follow hover card near cursor if visible
      if (this.hoverCard.classList.contains('show')) {
        const x = e.clientX + 16;
        const y = e.clientY + 16;
        this.hoverCard.style.left = Math.min(x, window.innerWidth - 220) + 'px';
        this.hoverCard.style.top = Math.min(y, window.innerHeight - 120) + 'px';
      }
    });
    this.stage.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).closest('.inv-slot,.spider-dialogue,.sim-modal,.combat-screen,button,a')) return;
      e.preventDefault(); this.echo();
    });
    this.stage.addEventListener('dragover', (e) => { if (Array.from(e.dataTransfer?.types || []).includes('text/limbo-item')) e.preventDefault(); });
    this.stage.addEventListener('drop', (e) => {
      const id = e.dataTransfer?.getData('text/limbo-item') as ItemId;
      if (!id || !this.state.inventory.includes(id)) return;
      e.preventDefault(); this.dropItem(id, e.clientX, e.clientY);
    });
    window.addEventListener('resize', () => {
      this.resize();
      this.scheduleInterfaceRecovery(false);
    });
    window.addEventListener('pageshow', () => this.scheduleInterfaceRecovery(true));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.scheduleInterfaceRecovery(true);
    });
  }

  async start() {
    this.ensureInterfaceWindows();
    this.bindChrome();
    if (this.state.completed) {
      this.diving = false;
      document.body.classList.add('sector-finished');
      this.showRunReport();
      return;
    }
    this.ensurePerceptionOverlay();
    if (sessionStorage.getItem('limbo-sector-reboot') === '1') {
      sessionStorage.removeItem('limbo-sector-reboot');
      document.body.classList.add('system-reboot');
    }
    this.resize();
    this.parallax.start();
    await this.playDiveIn();
    this.diving = true;
    await this.loadLoc(this.state.location);
    this.buildHotspots();
    this.buildExits();
    this.renderDroppedItems();
    this.renderInv();
    this.renderVitals();
    this.checkDefeat();
    this.renderMinimap();
    this.updateZone();
    this.startWorldClock();
    this.startSoundDynamics();
    simAudio.startAtmosphere(this.state.muted, LOCATIONS[this.state.location].ambient);
    this.startSanityDistortions();
    this.pulseMatrix('ok');
    this.notify('Ты внутри сектора · Рёкан', 'ok');
    this.scheduleEvents();
    this.startMatrixStreams();
    this.startInterfaceWatchdog();
    await this.showSectorBriefing();
    this.diving = false;
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
      const log = document.getElementById('diveLog');
      if (log) log.innerHTML = '';
      const reboot = document.body.classList.contains('system-reboot');
      overlay.dataset.mode = reboot ? 'reboot' : 'initial';
      const title = overlay.querySelector<HTMLElement>('.dive-title');
      if (title) title.textContent = reboot ? 'ПЕРЕЗАПУСК СЕКТОРА' : 'ПОГРУЖЕНИЕ';
      overlay.querySelector('.dive-module-stack')?.remove();
      const moduleStack = document.createElement('div');
      moduleStack.className = 'dive-module-stack';
      moduleStack.innerHTML = '<span class="dive-module-caption">СИНХРОНИЗАЦИЯ МОДУЛЕЙ</span>' +
        ['НЕЙРО-МОСТ','КАРТА СЕКТОРА','СЛОЙ ВОСПРИЯТИЯ','ИНВЕНТАРЬ','ПРОТОКОЛЫ УГРОЗ'].map((label,index) =>
          '<div class="dive-module-row" style="--module-delay:'+index*180+'ms"><i></i><span>'+label+'</span><b>ПОДКЛЮЧЕНО</b></div>'
        ).join('');
      const diveCore = overlay.querySelector('.dive-core') || title?.parentElement;
      diveCore?.appendChild(moduleStack);
      overlay.classList.add('active');
      const lines = reboot ? [
        { t: 'ЦЕФЕЙ · ПОЛНЫЙ СБРОС СЕАНСА', c: 'dim' },
        { t: 'ОЧИСТКА ПАМЯТИ ТЕКУЩЕГО ПРОХОДА', c: '' },
        { t: 'ПЕРЕЗАГРУЗКА НЕЙРО-МОСТА', c: 'cyan' },
        { t: 'ВОССТАНОВЛЕНИЕ КАРТЫ СЕКТОРА', c: '' },
        { t: 'СОЕДИНЕНИЕ УСТАНОВЛЕНО', c: 'hi' },
      ] : [
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
          document.body.classList.remove('system-reboot');
          this.diving = false;
          resolve();
        }, 700);
      }, 2200);
    });
  }

  private showSectorBriefing(): Promise<void> {
    this.diving = true;
    document.getElementById('sectorBriefing')?.remove();
    return new Promise(resolve => {
      const overlay = document.createElement('section');
      overlay.id = 'sectorBriefing';
      overlay.className = 'sector-briefing';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      const hasLantern = this.state.inventory.includes('ember_lantern');
      const hasSelected = !!this.state.selected && this.state.inventory.includes(this.state.selected);
      overlay.innerHTML = `
        <div class="sector-briefing-backdrop"></div>
        <div class="sector-briefing-panel">
          <div class="sector-briefing-kicker">ЦЕФЕЙ · RK-01 · ПРОТОКОЛ ВХОДА</div>
          <h2>ПЕРЕД ВХОДОМ В СЕКТОР</h2>
          <p class="sector-briefing-intro">Канал нестабилен. Проверь угрозы и быстрые действия перед продолжением.</p>
          <div class="sector-briefing-alerts">
            <article><b>ЗВУК</b><strong>Кидзё слышит шум</strong><span>Эхо, звон и возня в инвентаре могут привлечь её. Чем громче звук, тем быстрее она приблизится.</span></article>
            <article><b>СВЕТ</b><strong>Юрэй идёт на источник</strong><span>Зажжённый фонарь выдаёт положение. Погаси его, если заметишь движение в темноте.</span></article>
            <article><b>ВРЕМЯ И ПРЕДМЕТЫ</b><strong>Опасность истощает рассудок</strong><span>Долгое пребывание в комнате и ношение чёрного семени или сшитой маски постепенно разрушают восприятие. При нуле рассудка начинает падать здоровье.</span></article>
            <article><b>КОНТАКТ</b><strong>Не пропускай телеграф атаки</strong><span>В бою уклоняйся во время сигнала. Ошибка отнимает HP; атаки Кидзё дополнительно повреждают рассудок.</span></article>
          </div>
          <div class="sector-briefing-quick-label">БЫСТРЫЕ ДЕЙСТВИЯ</div>
          <div class="sector-briefing-quick">
            <button type="button" data-brief-action="echo"><kbd>Q</kbd><span><strong>ЭХО</strong><small>Послать звук в помещение</small></span></button>
            <button type="button" data-brief-action="use" ${hasSelected ? '' : 'disabled'}><kbd>R</kbd><span><strong>ПРИМЕНИТЬ</strong><small>Использовать выбранный предмет</small></span></button>
            <button type="button" data-brief-action="inspect" ${hasSelected ? '' : 'disabled'}><kbd>F</kbd><span><strong>ИЗУЧИТЬ</strong><small>Открыть выбранную находку</small></span></button>
            <button type="button" data-brief-action="lantern" ${hasLantern ? '' : 'disabled'}><kbd>L</kbd><span><strong>${this.lightActive ? 'ПОГАСИТЬ СВЕТ' : 'ВЫБРАТЬ ФОНАРЬ'}</strong><small>${hasLantern ? 'Переключить источник света' : 'Фонарь ещё не найден'}</small></span></button>
          </div>
          <div class="sector-briefing-footer"><span>СИМУЛЯЦИЯ ПРИОСТАНОВЛЕНА</span><button type="button" data-brief-continue>ПРОДОЛЖИТЬ ПОГРУЖЕНИЕ <i>→</i></button></div>
        </div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('visible'));
      let finished = false;
      const finish = (action?: string) => {
        if (finished) return;
        finished = true;
        overlay.classList.add('closing');
        window.setTimeout(() => {
          overlay.remove();
          this.diving = false;
          if (action === 'echo') this.echo();
          else if (action === 'use') this.useSelectedItem();
          else if (action === 'inspect' && this.state.selected) this.openItemExam(this.state.selected);
          else if (action === 'lantern' && hasLantern) { this.state.selected = 'ember_lantern'; this.useSelectedItem(); }
          resolve();
        }, 260);
      };
      overlay.querySelector('[data-brief-continue]')?.addEventListener('click', () => finish());
      overlay.querySelectorAll<HTMLButtonElement>('[data-brief-action]').forEach(button =>
        button.addEventListener('click', () => { if (!button.disabled) finish(button.dataset.briefAction); })
      );
    });
  }

  private showControlsTutorial(): Promise<void> {
    if (localStorage.getItem('limbo_controls_tutorial_seen') === '1') return Promise.resolve();
    this.diving = true;
    return new Promise(resolve => {
      const overlay = document.createElement('section');
      overlay.className = 'sim-tutorial-overlay';
      overlay.setAttribute('role','dialog');
      overlay.setAttribute('aria-modal','true');
      overlay.setAttribute('aria-labelledby','simTutorialTitle');
      overlay.innerHTML = `
        <div class="sim-tutorial-backdrop"></div>
        <div class="sim-tutorial-shell">
          <div class="sim-tutorial-kicker">ЦЕФЕЙ · ПЕРВИЧНЫЙ ИНСТРУКТАЖ / RK-01</div>
          <h2 id="simTutorialTitle">ПЕРЕД НАЧАЛОМ</h2>
          <p class="sim-tutorial-intro">Связь установлена. Коротко о том, как ориентироваться в секторе и не потерять важные находки.</p>
          <div class="sim-tutorial-grid">
            <article><b>01 / ИССЛЕДОВАНИЕ</b><strong>Точки на локации</strong><span>Нажимай на отмеченные места, осматривай окружение. Записки можно прочитать, сохранить в личном деле и забрать.</span></article>
            <article><b>02 / ИНВЕНТАРЬ</b><strong>Предметы и сочетания</strong><span>Выбери предмет в инвентаре, затем примени его к объекту. Некоторые вещи можно изучить, использовать или выбросить.</span></article>
            <article><b>03 / ОПАСНОСТЬ</b><strong>Свет, звук и время</strong><span>Шум привлекает Кидзё, свет — Юрэй, а долгое пребывание в комнате может привлечь Рокудзё.</span></article>
            <article><b>04 / ЛИЧНОЕ ДЕЛО</b><strong>Мысли и записи</strong><span>Открывай журнал в панели инвентаря. Там сохраняются прочитанные записки, наблюдения и изученные свойства.</span></article>
          </div>
          <div class="sim-tutorial-keys">
            <div><b>E</b><span>Эхо / ответить на сигнал</span></div>
            <div><b>Q</b><span>Позвать — создать шум</span></div>
            <div><b>R</b><span>Применить выбранный предмет</span></div>
            <div><b>F</b><span>Изучить выбранный предмет</span></div>
            <div><b>X</b><span>Выбросить выбранный предмет</span></div>
            <div><b>1–9</b><span>Выбрать слот инвентаря</span></div>
            <div><b>ESC</b><span>Закрыть окно / отступить в бою</span></div>
            <div><b>БОЙ</b><span>1 атака · 2 уклонение · 3 защита · 4 предмет · 5 отступить</span></div>
          </div>
          <div class="sim-tutorial-actions">
            <button type="button" data-tutorial-skip>ПРОПУСТИТЬ</button>
            <button type="button" data-tutorial-accept>ПОНЯТНО · НАЧАТЬ СЕКТОР</button>
          </div>
          <small class="sim-tutorial-foot">СИМУЛЯЦИЯ ПРИОСТАНОВЛЕНА ДО ВАШЕГО РЕШЕНИЯ</small>
        </div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(()=>overlay.classList.add('visible'));
      const finish = () => {
        localStorage.setItem('limbo_controls_tutorial_seen','1');
        overlay.classList.add('closing');
        window.setTimeout(()=>{overlay.remove();this.diving=false;resolve();},320);
      };
      overlay.querySelector('[data-tutorial-skip]')?.addEventListener('click',finish);
      overlay.querySelector('[data-tutorial-accept]')?.addEventListener('click',finish);
    });
  }

  private resize() {
    const r = this.stage.getBoundingClientRect();
    this.parallax.resize(r.width, r.height);
  }

  /**
   * Browsers may suspend canvas animation and timers while the tab is in the
   * background. Rebind the scene's DOM roots and rebuild transient controls
   * when the page becomes visible again, without disturbing an open encounter.
   */
  private ensureInterfaceWindows(): boolean {
    let repaired = false;
    let modal = document.getElementById('simModal');
    const modalWasOpen = !!modal && (!modal.hidden || modal.classList.contains('open'));
    const modalWasReport = !!modal?.classList.contains('report-mode');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'simModal';
      modal.className = 'sim-modal';
      document.body.appendChild(modal);
      repaired = true;
    }
    if (!modal.querySelector('#modalTitle') || !modal.querySelector('#modalBody') || !modal.querySelector('#modalActions') || !modal.querySelector('#modalClose')) {
      modal.innerHTML = '<div class="sim-modal-backdrop" id="modalBackdrop"></div><div class="sim-modal-panel"><div class="smp-h"><span id="modalTitle">ОСМОТР</span><button type="button" id="modalClose" aria-label="Закрыть">×</button></div><div class="smp-body-row"><div class="smp-visual" id="modalVisual"></div><div class="smp-b" id="modalBody"></div><div class="smp-a" id="modalActions"></div><div class="smp-note" id="modalNote"></div></div></div>';
      modal.hidden = !modalWasOpen;
      modal.classList.toggle('open', modalWasOpen);
      modal.classList.toggle('report-mode', modalWasReport);
      if (modalWasOpen) document.body.classList.add('inspection-open');
      repaired = true;
    }
    let combat = document.getElementById('combatScreen');
    const combatWasOpen = !!combat && (!combat.hidden || combat.classList.contains('open'));
    if (!combat) {
      combat = document.createElement('section');
      combat.id = 'combatScreen';
      combat.className = 'combat-screen';
      document.body.appendChild(combat);
      repaired = true;
    }
    const combatRequired = ['combatMonsterName','combatMonsterSprite','monsterHpText','monsterHpFill','combatPlayerHp','combatPlayerFill','combatLog','combatPhase','initiativeFill','enemyInitiativeFill','enemyTelegraph','combatWounds','combatInventoryItems','combatItemHint','combatAttack','combatDodge','combatGuard','combatNoise','combatFlee'];
    if (combatRequired.some(id => !combat!.querySelector('#' + id))) {
      combat.innerHTML = `
        <div class="combat-backdrop"></div>
        <div class="combat-panel">
          <div class="combat-top"><div class="combat-location"><strong id="combatLocationLabel">РЁКАН</strong><span id="combatLocationSub">RK-01 · СЕКТОР</span></div><span class="hud-eyebrow">КОНТАКТ · RK-01</span><strong id="combatPhase">ТВОЙ ХОД</strong><button id="combatFlee" type="button">ОТСТУПИТЬ</button></div>
          <div class="combat-arena"><div class="combat-monster-art" id="combatMonsterArt"><img id="combatMonsterSprite" class="combat-sprite" src="/assets/game/creatures/listener.png" alt=""><i></i><b></b></div><div class="combat-stats"><strong id="combatMonsterName">КИДЗЁ</strong><span>ЗДОРОВЬЕ СУЩЕСТВА <b id="monsterHpText">42 / 42</b></span><div class="combat-bar monster"><i id="monsterHpFill"></i></div><p id="combatLog">Оно приближается.</p></div></div>
          <div class="combat-player"><span>ТВОЁ ЗДОРОВЬЕ <b id="combatPlayerHp">100</b></span><div class="combat-bar player"><i id="combatPlayerFill"></i></div><div class="initiative-row"><span>ИНИЦИАТИВА</span><div class="combat-bar initiative"><i id="initiativeFill"></i></div><span>УГРОЗА</span><div class="combat-bar enemy-initiative"><i id="enemyInitiativeFill"></i></div></div><div class="enemy-telegraph"><span>ТЕЛЕГРАФ АТАКИ</span><i><b id="enemyTelegraph"></b></i></div><div class="combat-wounds" id="combatWounds">ТЯЖЁЛЫХ РАН НЕТ</div></div>
          <div class="combat-targets"><span>ЦЕЛЬ УДАРА</span><button type="button" data-hit-zone="head">ГОЛОВА</button><button type="button" data-hit-zone="torso" class="selected">КОРПУС</button><button type="button" data-hit-zone="arms">РУКИ</button><button type="button" data-hit-zone="legs">НОГИ</button></div>
          <section class="combat-inventory" aria-label="Предметы, доступные в бою"><div class="combat-inventory-heading"><span>СНАРЯЖЕНИЕ</span><small>ЦВЕТНОЕ — МОЖНО ПРИМЕНИТЬ · СЕРОЕ — НЕ ПОДХОДИТ</small></div><div class="combat-inventory-items" id="combatInventoryItems"></div><p class="combat-item-hint" id="combatItemHint">Нажми на цветной предмет, чтобы применить его.</p></section>
          <div class="combat-actions" aria-label="Боевые действия"><button id="combatAttack" type="button"><kbd>1</kbd> АТАКОВАТЬ</button><button id="combatDodge" type="button" disabled><kbd>2</kbd> УКЛОНИТЬСЯ</button><button id="combatGuard" type="button"><kbd>3</kbd> ЗАЩИТИТЬСЯ</button><button id="combatNoise" type="button"><kbd>4</kbd> ОТВЛЕЧЬ</button></div>
          <div class="combat-controls-hint">ВЫБЕРИ ЗОНУ ПОПАДАНИЯ · УКЛОНЯЙСЯ В МОМЕНТ УДАРА · ESC — ОТСТУПИТЬ</div>
        </div>`;
      combat.hidden = !combatWasOpen;
      combat.classList.toggle('open', combatWasOpen);
      combat.setAttribute('aria-hidden', combatWasOpen ? 'false' : 'true');
      if (combatWasOpen) document.body.classList.add('combat-active');
      repaired = true;
    }
    if (!document.getElementById('threatOverlay')) {
      const threat = document.createElement('section');
      threat.id = 'threatOverlay';
      threat.className = 'threat-overlay';
      threat.setAttribute('aria-hidden','true');
      threat.innerHTML = '<div class="threat-silhouette" aria-hidden="true"><span></span><i></i></div><div class="threat-copy"><span class="hud-eyebrow">ДВИЖЕНИЕ В ТЕМНОТЕ</span><strong id="threatTitle">ЧТО-ТО ПРИБЛИЖАЕТСЯ</strong><p id="threatText">Не двигайся.</p></div><div class="threat-actions"><button type="button" class="hud-action" id="btnHide">ЗАТАИТЬСЯ</button><button type="button" class="hud-action primary" id="btnConfront">ОТОГНАТЬ</button></div>';
      document.body.appendChild(threat);
      repaired = true;
    }
    const stage = document.getElementById('simStage');
    if (stage && !document.getElementById('notifyHost')) {
      const host = document.createElement('div');
      host.id = 'notifyHost';
      host.className = 'notify-host';
      stage.appendChild(host);
      repaired = true;
    }
    const hpTrack = document.querySelector('.hud-vitals .health .vital-track');
    if (hpTrack && !document.getElementById('hpBar')) {
      const bar = document.createElement('span'); bar.id = 'hpBar'; bar.style.width = this.state.health + '%'; hpTrack.appendChild(bar); repaired = true;
    }
    const sanityTrack = document.querySelector('.hud-vitals .sanity .vital-track');
    if (sanityTrack && !document.getElementById('sanBar')) {
      const bar = document.createElement('span'); bar.id = 'sanBar'; bar.style.width = this.state.sanity + '%'; sanityTrack.appendChild(bar); repaired = true;
    }
    return repaired;
  }

  private bindRebuiltWindowControls() {
    const bind = (id: string, key: string, action: () => void) => {
      const node = document.getElementById(id) as HTMLButtonElement | null;
      if (!node || node.dataset[key] === '1') return;
      node.dataset[key] = '1';
      node.addEventListener('click', action);
    };
    bind('modalClose','simBound',() => this.closeModal());
    bind('modalBackdrop','simBound',() => { if (!document.getElementById('simModal')?.classList.contains('report-mode')) this.closeModal(); });
    bind('combatAttack','simBound',() => this.combatAction('attack'));
    bind('combatGuard','simBound',() => this.combatAction('guard'));
    bind('combatDodge','simBound',() => this.combatDodge());
    bind('combatNoise','simBound',() => this.combatAction('noise'));
    bind('combatFlee','simBound',() => this.combatAction('flee'));
    document.querySelectorAll<HTMLButtonElement>('[data-hit-zone]').forEach(node => {
      if (node.dataset.simBound === '1') return;
      node.dataset.simBound = '1';
      node.addEventListener('click', () => {
        const zone = node.dataset.hitZone;
        if (zone === 'head' || zone === 'torso' || zone === 'arms' || zone === 'legs') this.selectCombatTarget(zone);
      });
    });
    bind('btnHide','simBound',() => this.resolveThreat('hide'));
    bind('btnConfront','simBound',() => this.startCombat());
  }

  private startInterfaceWatchdog() {
    if (this.interfaceWatchdogTimer) clearInterval(this.interfaceWatchdogTimer as number);
    this.interfaceWatchdogTimer = window.setInterval(() => {
      if (document.hidden || this.diving || this.state.completed || this.state.defeated) return;
      if (this.ensureInterfaceWindows()) this.bindRebuiltWindowControls();
      const combatOpen = document.getElementById('combatScreen')?.classList.contains('open');
      const modalOpen = document.getElementById('simModal')?.classList.contains('open');
      if (combatOpen || modalOpen || document.getElementById('spiderDialogue') || document.getElementById('systemConfirm')) return;

      const stage = document.getElementById('simStage');
      const hotspots = document.getElementById('hotspotLayer');
      const exits = document.getElementById('exitLayer');
      const inventory = document.getElementById('invSlots');
      const canvas = document.getElementById('simCanvas');
      const expectedHotspots = hotspotsFor(this.state.location).filter(hs => {
        if (hs.id === 'hs_door' && this.state.flags.door_unlocked) return false;
        if (hs.clueFlag && this.state.flags['filed_' + hs.clueFlag]) return false;
        const finds = hs.items?.length ? hs.items : (hs.item ? [hs.item] : []);
        const flags = hs.takenFlags?.length ? hs.takenFlags : (hs.takenFlag ? [hs.takenFlag] : []);
        if (finds.length && flags.length && finds.every((_, index) => !!this.state.flags[flags[index] || ''])) return false;
        if (!finds.length && hs.takenFlag && this.state.flags[hs.takenFlag]) return false;
        return true;
      }).length;
      const expectedExits = LOCATIONS[this.state.location].exits.length;
      const broken = !stage || stage !== this.stage || !this.stage.isConnected || !hotspots || !exits || !inventory || !canvas ||
        (expectedHotspots > 0 && hotspots.querySelectorAll('.hotspot').length === 0) ||
        (expectedExits > 0 && exits.querySelectorAll('.exit-btn').length === 0) ||
        inventory.querySelectorAll('.inv-slot').length !== 12;
      if (broken) this.scheduleInterfaceRecovery(true);
    }, 2500);
  }

  private scheduleInterfaceRecovery(rebuild = true) {
    if (this.diving || this.state.completed) return;
    if (this.recoveryFrame) cancelAnimationFrame(this.recoveryFrame);
    this.recoveryFrame = requestAnimationFrame(() => {
      this.recoveryFrame = 0;
      if (this.ensureInterfaceWindows()) this.bindRebuiltWindowControls();
      const currentStage = document.getElementById('simStage');
      if (!currentStage) return;
      const stageChanged = currentStage !== this.stage || !this.stage.isConnected;
      if (stageChanged) {
        this.parallax.stop();
        this.stage = currentStage;
      }
      let canvas = document.getElementById('simCanvas') as HTMLCanvasElement | null;
      if (!canvas) { canvas = document.createElement('canvas'); canvas.id = 'simCanvas'; this.stage.prepend(canvas); }
      if (stageChanged || this.parallax.canvas !== canvas) {
        this.parallax.stop();
        this.parallax = new ParallaxRenderer(canvas);
        void this.loadLoc(this.state.location);
      }
      let hotspotRoot = document.getElementById('hotspotLayer');
      if (!hotspotRoot) { hotspotRoot = document.createElement('div'); hotspotRoot.id = 'hotspotLayer'; hotspotRoot.className = 'hotspot-layer'; this.stage.appendChild(hotspotRoot); }
      let exitRoot = document.getElementById('exitLayer');
      if (!exitRoot) { exitRoot = document.createElement('div'); exitRoot.id = 'exitLayer'; exitRoot.className = 'exit-layer'; this.stage.appendChild(exitRoot); }
      this.hsLayer = hotspotRoot;
      this.exitLayer = exitRoot;
      this.invEl = document.getElementById('invSlots') || this.invEl;
      this.hoverCard = document.getElementById('hoverCard') || this.hoverCard;
      if (!this.hoverCard?.isConnected) {
        this.hoverCard = document.createElement('div');
        this.hoverCard.id = 'hoverCard';
        this.hoverCard.className = 'hover-card';
        document.body.appendChild(this.hoverCard);
      }

      this.resize();
      if (!this.parallax.running) this.parallax.start();
      if (!rebuild || document.getElementById('combatScreen')?.classList.contains('open') ||
          document.getElementById('spiderDialogue') ||
          document.getElementById('simModal')?.classList.contains('open') ||
          document.getElementById('systemConfirm')) return;

      this.ensurePerceptionOverlay();
      this.buildHotspots();
      this.buildExits();
      this.renderDroppedItems();
      this.renderInv();
      this.renderVitals();
      this.renderMinimap();
      this.updateZone();
    });
  }

  private showSystemConfirm(mode: 'exit' | 'reset') {
    document.getElementById('systemConfirm')?.remove();
    const isExit = mode === 'exit';
    const overlay = document.createElement('section');
    overlay.id = 'systemConfirm';
    overlay.className = 'system-confirm';
    overlay.dataset.mode = mode;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="wave-confirm-scene" aria-hidden="true">
        <div class="wave-orbit orbit-a"></div>
        <div class="wave-orbit orbit-b"></div>
        <div class="wave-orbit orbit-c"></div>
        <div class="wave-orbit orbit-d"></div>
        <div class="wave-orbit orbit-e"></div>
      </div>
      <div class="wave-confirm-content">
        <div class="system-confirm-kicker">ЦЕФЕЙ <span>///</span> ${isExit ? 'ЗАВЕРШЕНИЕ СЕАНСА' : 'ЦИКЛ ВОССТАНОВЛЕНИЯ'}</div>
        <div class="wave-confirm-mark">${isExit ? '◌' : '↻'}</div>
        <h2>${isExit ? 'ВЕРНУТЬСЯ ИЗ ПОГРУЖЕНИЯ?' : 'ВОЙТИ В СЕКТОР СНОВА?'}</h2>
        <p>${isExit ? 'Текущий прогресс сохранён. Канал будет плавно закрыт, а досье останется доступным.' : 'Текущий проход будет сброшен. Накопленный архив кампании и награды останутся нетронутыми.'}</p>
        <div class="wave-confirm-actions">
          <button type="button" data-confirm-cancel>ОСТАТЬСЯ</button>
          <button type="button" class="wave-confirm-accept" data-confirm-accept>${isExit ? 'ЗАВЕРШИТЬ СЕАНС' : 'ПЕРЕЗАПУСТИТЬ'}</button>
        </div>
        <div class="wave-confirm-foot">${isExit ? 'СВЯЗЬ · СОХРАНЕНА' : 'СОСТОЯНИЕ · БУДЕТ ОБНОВЛЕНО'}</div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    const cancel = () => {
      overlay.classList.add('dismissing');
      window.setTimeout(() => overlay.remove(), 620);
    };
    overlay.querySelector('[data-confirm-cancel]')?.addEventListener('click', cancel);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) cancel(); });
    overlay.querySelector('[data-confirm-accept]')?.addEventListener('click', () => {
      overlay.classList.add(isExit ? 'wave-closing' : 'wave-restarting');
      overlay.querySelector('.wave-confirm-content')?.classList.add('wave-confirm-status');
      const heading = overlay.querySelector('h2');
      const copy = overlay.querySelector('p');
      const accept = overlay.querySelector('[data-confirm-accept]');
      const cancelButton = overlay.querySelector('[data-confirm-cancel]');
      if (heading) heading.textContent = isExit ? 'КАНАЛ ЗАКРЫВАЕТСЯ' : 'СЕКТОР ВОССТАНАВЛИВАЕТСЯ';
      if (copy) copy.textContent = isExit
        ? 'Сигнал возвращается к Цефею. До следующего погружения.'
        : 'Память прохода очищается. Архив кампании сохранён.';
      if (accept) accept.textContent = isExit ? 'СЕАНС ЗАВЕРШЁН' : 'СБРОС СОСТОЯНИЯ';
      if (cancelButton) cancelButton.remove();
      overlay.querySelector('.wave-confirm-foot')?.replaceChildren(document.createTextNode(isExit ? 'DISCONNECTING · RK-01' : 'REINITIALIZING · RK-01'));
      if (isExit) {
        window.setTimeout(() => { window.location.href = '/scene-ryokan.html'; }, 1550);
      } else {
        document.body.classList.add('system-reboot');
        sessionStorage.setItem('limbo-sector-reboot', '1');
        window.setTimeout(() => { resetSim(); window.location.reload(); }, 1750);
      }
    });
  }

  private bindChrome() {
    const muteButton = document.getElementById('btnMute');
    if (muteButton) muteButton.textContent = this.state.muted ? 'SFX OFF' : 'SFX ON';
    document.body.classList.toggle('audio-muted', this.state.muted);
    muteButton?.addEventListener('click', () => {
      setMuted(this.state, !this.state.muted);
      const b = document.getElementById('btnMute');
      if (b) b.textContent = this.state.muted ? 'SFX OFF' : 'SFX ON';
      document.body.classList.toggle('audio-muted', this.state.muted);
      simAudio.unlock();
      if (!this.state.muted) {
        simAudio.click(false);
        const loc = LOCATIONS[this.state.location];
        simAudio.startAmbient(false, loc.ambient);
        document.body.classList.add('audio-ready');
      } else simAudio.stopAmbient();
    });
    this.ensureThoughtJournal();
    document.getElementById('btnExit')?.addEventListener('click', () => this.showSystemConfirm('exit'));
    document.getElementById('btnReset')?.addEventListener('click', () => this.showSystemConfirm('reset'));
    (document.getElementById('btnInspectItem') || document.getElementById('btnExamine'))?.addEventListener('click', () => {
      if (!this.state.selected) { this.notify('Сначала выбери предмет в инвентаре', 'warn'); return; }
      this.openItemExam(this.state.selected);
    });
    document.getElementById('btnUseItem')?.addEventListener('click', () => this.useSelectedItem());
    document.getElementById('btnHide')?.addEventListener('click', () => this.resolveThreat('hide'));
    document.getElementById('btnConfront')?.addEventListener('click', () => this.startCombat());
    document.getElementById('btnCall')?.addEventListener('click', () => { simAudio.call(this.state.muted); this.makeNoise('Ты громко окликнул кого-то в темноте.'); });
    document.getElementById('combatAttack')?.addEventListener('click', () => this.combatAction('attack'));
    document.getElementById('combatGuard')?.addEventListener('click', () => this.combatAction('guard'));
    document.getElementById('combatDodge')?.addEventListener('click', () => this.combatDodge());
    document.getElementById('combatNoise')?.addEventListener('click', () => this.combatAction('noise'));
    document.getElementById('combatFlee')?.addEventListener('click', () => this.combatAction('flee'));
    document.querySelectorAll<HTMLButtonElement>('[data-hit-zone]').forEach(b => b.addEventListener('click', () => {
      const zone = b.dataset.hitZone;
      if (zone === 'head' || zone === 'torso' || zone === 'arms' || zone === 'legs') this.selectCombatTarget(zone);
    }));
    document.getElementById('modalClose')?.addEventListener('click', () => this.closeModal());
    document.getElementById('modalBackdrop')?.addEventListener('click', () => { if (document.getElementById('simModal')?.classList.contains('report-mode')) return; this.closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (this.diving) return;
      if (e.key === 'Escape') {
        if (document.getElementById('combatScreen')?.classList.contains('open')) this.combatAction('flee');
        else if (!document.getElementById('simModal')?.classList.contains('report-mode')) this.closeModal();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName))) return;
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (!document.getElementById('combatScreen')?.classList.contains('open')) {
        if (document.getElementById('simModal')?.classList.contains('open') || document.getElementById('spiderDialogue')) return;
        if (key === 'e') { this.echo(); return; }
        if (key === 'q') { simAudio.call(this.state.muted); this.makeNoise('Ты окликнул кого-то в темноте.'); return; }
        if (key === 'r') { this.useSelectedItem(); return; }
        if (key === 'f' && this.state.selected) { this.openItemExam(this.state.selected); return; }
        if (key === 'x' && this.state.selected) { this.dropItem(this.state.selected); return; }
        if (/^[1-9]$/.test(key)) { const id=this.state.inventory[Number(key)-1]; if(id) this.onInv(id); return; }
        return;
      }
      if (key === '1' || key === 'a') this.combatAction('attack');
      else if (key === '2' || key === ' ') this.combatDodge();
      else if (key === '3' || key === 'g') this.combatAction('guard');
      else if (key === '4' || key === 'i') this.combatAction('item');
      else if (key === '5' || key === 'f') this.combatAction('flee');
    });
    // Keep audio unlocked after the first trusted user gesture and when returning to the tab.
    const unlockAudio = () => simAudio.unlock();
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
  }

  private applyDangerousPickup(id: ItemId) {
    const loss = id === 'black_seed' ? 13 : id === 'stitched_mask' ? 8 : 0;
    if (!loss) return;
    this.state.sanity = Math.max(0, this.state.sanity - loss);
    this.lastSanityExposureAt = Date.now();
    this.state.flags.took_dangerous_object = true;
    this.state.flags['took_' + id] = true;
    if (id === 'black_seed') this.state.flags.black_seed_taken = true;
    this.notify(id === 'black_seed' ? 'Семя дёрнулось в ладони. Рассудок −13.' : 'Из маски донёсся короткий вдох. Рассудок −8.', 'warn');
    if (id === 'black_seed') simAudio.whisper(this.state.muted);
    else simAudio.maskWhisper(this.state.muted, 1.1);
  }

  private tickSanityExposure() {
    const now = Date.now();
    if (now - this.lastSanityExposureAt < 15000 || this.state.defeated || this.state.sanity <= 0) return;
    this.lastSanityExposureAt = now;

    const roomExposure = now - this.roomEnteredAt >= 30000;
    const carryingDanger = this.state.inventory.some(id => id === 'black_seed' || id === 'stitched_mask');
    const loss = (roomExposure ? 1 : 0) + (carryingDanger ? 1 : 0);
    if (!loss) return;

    this.state.sanity = Math.max(0, this.state.sanity - loss);
    if (carryingDanger && roomExposure) {
      this.showSense('◉', 'Комната давит на мысли. Опасная находка отзывается в ладони.', true);
    } else if (carryingDanger) {
      this.showSense('◉', 'Опасная находка тихо вытягивает рассудок.', true);
    } else {
      this.showSense('◉', 'Слишком долгое пребывание здесь стирает чувство реальности.', true);
    }
    saveState(this.state);
    this.renderVitals();
  }

  private scheduleEvents() {
    if (this.eventTimer) clearInterval(this.eventTimer as number);
    this.eventTimer = setInterval(() => {
      if (this.diving || document.hidden || this.state.defeated) return;
      if (this.state.sanity <= 0 && !this.state.defeated) {
        this.sanityCollapseTick += 1;
        this.state.health = Math.max(0, this.state.health - 8);
        this.notify('Рассудок исчез. Тело больше не различает реальность.', 'warn');
        this.renderVitals();
        saveState(this.state);
        if (this.state.health <= 0) return;
      } else this.sanityCollapseTick = 0;
      this.tickSanityExposure();
      if (this.tickSpiderPresence()) return;
      if (this.threatActive || document.body.classList.contains('combat-active') || Date.now() < this.threatCooldown || this.state.defeated) return;
      const stayed = Date.now() - this.roomEnteredAt;
      this.tickMaskEffects();
      const dangerFill = document.getElementById('dangerFill') as HTMLElement | null;
      const dangerValue = document.getElementById('dangerValue');
      const watchValue = document.getElementById('watchValue');
      const activeNoise = this.currentSoundLevel >= 16;
      const watched = activeNoise && Math.random() < Math.min(.72, this.currentSoundLevel / 115);
      this.updateAwareness(this.threatActive ? 2 : watched || activeNoise ? 1 : 0);
      if (dangerFill) dangerFill.style.width = (this.threatActive ? 100 : activeNoise ? 72 : watched ? 42 : 12) + '%';
      if (dangerValue) dangerValue.textContent = this.threatActive ? 'КРИТИЧЕСКАЯ' : activeNoise ? 'ПОВЫШЕНА' : watched ? 'СРЕДНЯЯ' : 'НИЗКАЯ';
      if (watchValue) watchValue.textContent = this.threatActive ? 'ОНО ВИДИТ ВАС' : watched ? 'ЗА ВАМИ НАБЛЮДАЮТ' : 'ЗА ВАМИ НЕ СЛЕДЯТ';
      if (!activeNoise && !this.threatActive) {
        const caption = document.getElementById('soundCaption'); if (caption) caption.textContent = 'Тишина… (слышен дождь)';
      }
      // Each creature has its own trigger condition.
      // Three independent creature behaviours, with a small shared encounter roll.
      // The type is chosen from the player's current behaviour and room, not a single hard-coded room gate.
      if (this.noiseEncounterPending) {
        if (Date.now() > this.noiseEncounterExpiresAt) this.noiseEncounterPending = false;
        else {
          const noise = Math.max(this.currentSoundLevel, this.noisePeak);
          const chance = noise >= 68 ? .62 : noise >= 38 ? .48 : .30;
          if (noise >= 16 && Math.random() < chance) { this.noiseEncounterPending = false; this.startThreat('sound'); return; }
        }
      }
      const lightChance = this.lightActive && !this.maskWorn ? .22 : 0;
      const soundPressure = this.currentSoundLevel / 100;
      const soundChance = this.currentSoundLevel >= 16 ? Math.min(.52, .04 + this.currentSoundLevel * .0048) : 0;
      const dwellChance = stayed > 45000 ? Math.min(.26, .025 + stayed / 1100000 + soundPressure * .18) : 0;
      const encounter = Math.random();
      const totalChance = lightChance + soundChance + dwellChance;
      if (totalChance > 0 && encounter < Math.min(.62, totalChance)) {
        const pick = Math.random() * totalChance;
        this.startThreat(pick < lightChance ? 'light' : pick < lightChance + soundChance ? 'sound' : 'dweller');
        return;
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


  private spiderAngerLevel(): number {
    const anger = ['spider_anger_call','spider_anger_turn','spider_anger_hand','spider_anger_timeout','spider_anger_timeout_0','spider_anger_timeout_1','spider_anger_timeout_2','spider_anger_timeout_3'].filter(key => !!this.state.flags[key]).length;
    const calm = ['spider_calm_look','spider_calm_steady','spider_calm_bell','spider_calm_words'].filter(key => !!this.state.flags[key]).length;
    return Math.max(0, anger - calm);
  }

  // Spider arc: an uncanny apparition -> stalking shadow -> active hunter -> full encounter.
  private tickSpiderPresence(): boolean {
    if (document.getElementById('spiderDialogue')) return true;
    if (this.state.flags.spider_defeated || this.state.flags.spider_released || this.state.defeated ||
        document.body.classList.contains('combat-active') || this.threatActive) return false;
    if (Date.now() < this.spiderNextAt) return false;
    if (this.spiderStage === 0) {
      const eligible = this.state.visited.length >= 1 && this.state.sanity <= 84;
      const pressure = Math.max(0, 84 - this.state.sanity);
      // Recurring apparition; low sanity makes the encounter much more likely.
      const chance = Math.min(.82, .105 + pressure * .008 + (this.state.flags.black_seed_taken ? .07 : 0) + (this.state.flags.spider_called ? .035 : 0) + this.spiderAngerLevel() * .075);
      if (eligible && Math.random() < chance) { this.openSpiderBeat(0); return true; }
      return false;
    }
    this.openSpiderBeat(this.spiderStage);
    return true;
  }

  private openSpiderBeat(stage: number) {
    const assets = ['spider0.png','spider1.png','spider2.png','spider4.png'];
    const lines = [
      ['НЕЗНАКОМОЕ ДВИЖЕНИЕ','У края света стоит фигура. В ней почти угадывается человек — кожа, плечи, привычка держать голову чуть набок. Но лицо будто забыли закончить. «Ты тоже ищешь дверь?»','Посмотреть в ответ','Сделать вид, что не заметил','Тихо окликнуть'],
      ['ТЕНЬ ИДЁТ СЛЕДОМ','Тень отделилась от твоих ног. Она повторяет шаги с задержкой, а когда ты останавливаешься — продолжает идти ещё один короткий шаг. «Не оборачивайся. Тогда я смогу идти рядом».','Не оборачиваться','Оставить шёлковую нить','Резко обернуться'],
      ['ОНА ПЕРЕСТАЛА ПРЯТАТЬСЯ','Из тени вытягиваются длинные пальцы. «Я знаю короткий путь. Я держала дверь, пока остальные уходили. Ты ведь не оставишь меня здесь снова?»','Спросить, кого она ждала','Позвонить в колокольчик','Сказать, что она не обязана ждать одна','Принять протянутую руку'],
      ['ТЕПЕРЬ У НЕЁ ЕСТЬ ТЕЛО','Существо выходит во весь рост. Нити уходят за его спину и исчезают под домом. «Ты так долго делал вид, что меня нет. Теперь останься. Я покажу, как здесь тихо».','Драться','Бежать, пока проход открыт','Позволить ей взять тебя за руку']
    ];
    this.spiderStage = stage;
    this.state.flags['spider_seen_' + stage] = true;
    saveState(this.state);
    document.getElementById('spiderPresence')?.remove();
    const figure = document.createElement('div');
    figure.id = 'spiderPresence'; figure.className = 'spider-presence spider-presence-' + stage;
    const img = document.createElement('img'); img.src = '/assets/game/creatures/' + assets[stage]; img.alt = ''; img.draggable = false;
    figure.appendChild(img); this.stage.appendChild(figure);
    requestAnimationFrame(() => figure.classList.add('visible'));
    document.getElementById('spiderDialogue')?.remove();
    const panel = document.createElement('section');
    panel.id = 'spiderDialogue'; panel.className = 'spider-dialogue'; panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true');
    const title = document.createElement('h3'); title.textContent = lines[stage][0];
    const copy = document.createElement('p'); copy.textContent = lines[stage][1];
    const choices = document.createElement('div'); choices.className = 'spider-choices';
    const actions = [['look','ignore','call'],['steady','thread','turn'],['ask','bell','soothe','hand'],['fight','run','surrender']][stage];
    const choiceHints = [
      ['Не отводить взгляд и рассмотреть лицо.','Не провоцировать то, чего пока не понимаешь.','Проверить, ответит ли оно.'],
      ['Сохранить спокойный шаг.','Предложить нить вместо руки.','Попытаться поймать её на движении.'],
      ['Выслушать, не обещая ничего.','Звук может разорвать её форму.','Дать понять, что её больше не бросят одну.','Она обещает вывести тебя. Цена неизвестна.'],
      ['Не дать ей приблизиться.','Шанс уйти есть, но она успеет задеть тебя.','Самый опасный выбор. Неизвестно, отпустит ли она.']
    ][stage];
    for (let n=0;n<actions.length;n++) {
      const btn=document.createElement('button'); btn.type='button'; btn.className='spider-choice';
      btn.dataset.spiderAction=actions[n];
      const strong=document.createElement('strong'); strong.textContent=lines[stage][n+2];
      const hint=document.createElement('small'); hint.textContent=choiceHints[n];
      btn.append(strong,hint); btn.addEventListener('click',()=>this.chooseSpider(actions[n])); choices.appendChild(btn);
    }
    const timer = document.createElement('div'); timer.className = 'spider-deadline';
    const timerBar = document.createElement('i'); timer.appendChild(timerBar);
    const anger = this.spiderAngerLevel();
    const deadline = Math.max(stage === 3 ? 4300 : 6200, (stage === 3 ? 8000 : stage === 2 ? 11000 : 12500) - anger * 1350);
    const timerText = document.createElement('span'); timerText.textContent = stage === 3 ? 'АТАКА ЧЕРЕЗ ' + (deadline / 1000).toFixed(1) + ' СЕК.' : 'ОТВЕТ НУЖЕН · ' + (deadline / 1000).toFixed(1) + ' СЕК.';
    timer.appendChild(timerText); panel.append(timer,title,copy,choices); document.body.appendChild(panel); requestAnimationFrame(()=>panel.classList.add('visible'));
    timerBar.style.animationDuration = deadline + 'ms';
    if(this.spiderDialogTimer) clearTimeout(this.spiderDialogTimer as number);
    this.spiderDialogTimer=window.setTimeout(()=>{
      if(!document.getElementById('spiderDialogue')) return;
      if(stage===3){
        this.state.sanity=Math.max(0,this.state.sanity-(12+anger*2));
        this.state.health=Math.max(1,this.state.health-(7+anger*2));
        this.state.flags.spider_anger_timeout_3 = true;
        this.notify('Дзерогумо решила за тебя. Нити рвутся с потолка — она нападает. −' + (12+anger*2) + ' рассудка.','warn');
        this.closeSpiderBeat(); this.spiderInCombat=true; saveState(this.state); this.renderVitals(); this.startCombat();
      } else this.chooseSpider('timeout');
    },deadline);
    simAudio.whisper(this.state.muted);
    this.showSense('◉',['Краем глаза замечена фигура между деревьями.','Твоя тень движется не в такт.','Что-то перекрыло путь.','Существо вышло из тени.'][stage],stage>=2);
  }

  private closeSpiderBeat() {
    if(this.spiderDialogTimer) clearTimeout(this.spiderDialogTimer as number);
    this.spiderDialogTimer=0; document.getElementById('spiderDialogue')?.remove(); document.getElementById('spiderPresence')?.remove();
  }

  private chooseSpider(action: string) {
    if(!document.getElementById('spiderDialogue')) return;
    this.closeSpiderBeat();
    const hasThread=this.state.inventory.includes('silk_thread'), hasBell=this.state.inventory.includes('copper_bell');
    if(this.spiderStage===0) {
      if(action==='timeout'){this.state.flags.spider_anger_timeout_0=true;this.state.sanity=Math.max(0,this.state.sanity-3);this.notify('Ты слишком долго молчал. Фигура стала ближе. −3 рассудка.','warn');this.spiderNextAt=Date.now()+9000;}
      else if(action==='look'){this.state.flags.spider_recognized=true;this.state.flags.spider_calm_look=true;this.state.sanity=Math.min(100,this.state.sanity+2);this.notify('На её лице нет глаз. Но ты понял: она ждёт, когда её назовут. +2 рассудка.','ok');this.spiderNextAt=Date.now()+24000;}
      else if(action==='call'){this.state.flags.spider_called=true;this.state.flags.spider_anger_call=true;this.makeNoise('Ты окликнул фигуру. Она повторила твоё имя с задержкой.');this.spiderNextAt=Date.now()+12000;}
      else {this.notify('Ты отвёл взгляд. На мокрых досках остался след босой ступни.','info');this.spiderNextAt=Date.now()+19000;}
      this.spiderStage=1;
    } else if(this.spiderStage===1) {
      if(action==='timeout'){this.state.flags.spider_anger_timeout_1=true;this.state.sanity=Math.max(0,this.state.sanity-6);this.notify('Тень дёрнула за твою пятку. Она больше не ждёт. −6 рассудка.','warn');this.spiderNextAt=Date.now()+4500;}
      else if(action==='thread'&&hasThread){{ const at=this.state.inventory.indexOf('silk_thread'); if(at>=0)this.state.inventory.splice(at,1); }this.state.flags.used_silk_thread=true;this.state.flags.spider_thread_given=true;this.state.flags.spider_released=true;this.spiderStage=0;this.notify('Нить натянулась сама собой и ушла в темноту. Паутина ослабла. Впервые за всё время шаги за спиной стихли.','ok');this.spiderNextAt=Date.now()+99999999;}
      else if(action==='steady'){this.state.flags.spider_stared_down=true;this.state.flags.spider_calm_steady=true;this.notify('Ты не обернулся. Тень отстала, но не исчезла.','ok');this.spiderNextAt=Date.now()+28000;}
      else {this.state.flags.spider_anger_turn=true;this.state.sanity=Math.max(0,this.state.sanity-4);this.notify(action==='thread'?'Нити нет. Тень касается твоей пятки.':'Тень рванулась раньше, чем ты успел её поймать.','warn');this.spiderNextAt=Date.now()+6500;}
      this.spiderStage=2;
    } else if(this.spiderStage===2) {
      if(action==='timeout'){this.state.flags.spider_anger_timeout_2=true;this.state.sanity=Math.max(0,this.state.sanity-10);this.notify('Молчание она приняла за отказ. Дзерогумо приближается. −10 рассудка.','warn');this.spiderStage=3;this.spiderNextAt=Date.now()+1800;}
      else if(action==='ask'){this.state.flags.spider_story_heard=true;this.state.sanity=Math.max(0,this.state.sanity-2);this.notify('«Меня оставили под домом. Я держала дверь, пока они уходили».','info');this.spiderStage=3;this.spiderNextAt=Date.now()+34000;}
      else if(action==='bell'&&hasBell){{ const at=this.state.inventory.indexOf('copper_bell'); if(at>=0)this.state.inventory.splice(at,1); }this.state.flags.spider_calm_bell=true;this.state.flags.used_copper_bell=true;this.notify('Колокольчик раскалывает тишину. Паутина отступает, но обещает вернуться.','ok');this.spiderStage=3;this.spiderNextAt=Date.now()+42000;}
      else if(action==='soothe'){
        this.state.flags.spider_calm_words=true;
        this.state.flags.spider_story_heard=true;
        this.state.sanity=Math.min(100,this.state.sanity+4);
        this.spiderStage=3;
        this.spiderNextAt=Date.now()+52000;
        this.notify('Ты говоришь, что её ожидание закончилось. Нити медленно опускаются. Она не становится доброй — лишь отступает. +4 рассудка.','ok');
      }
      else if(action==='hand'){
        this.state.flags.spider_anger_hand=true;
        const risk=Math.min(.78,(this.state.sanity<30?.48:this.state.sanity<55?.31:.16)+(this.maskWorn?.12:0)+(this.state.inventory.includes('black_seed')?.12:0));
        this.state.flags.spider_hand_taken=true;
        if(Math.random()<risk){this.state.health=0;this.state.sanity=0;this.notify('«Я выведу тебя», — шепчет она. Пальцы смыкаются с другой стороны кожи.','warn');saveState(this.state);this.renderVitals();this.checkDefeat();return;}
        this.state.sanity=Math.max(0,this.state.sanity-22);this.notify('Она отпустила тебя. На ладони осталась чёрная нить под кожей.','warn');this.spiderStage=3;this.spiderNextAt=Date.now()+12000;
      } else {this.state.flags.spider_anger_hand=true;this.state.sanity=Math.max(0,this.state.sanity-7);this.spiderStage=3;this.spiderNextAt=Date.now()+10000;this.notify('Тень рвётся к тебе. Теперь она больше не скрывается.','warn');}
    } else {
      if(action==='fight'){this.spiderInCombat=true;this.startCombat();return;}
      if(action==='run'){
        if(Math.random()<.62){this.state.health=Math.max(1,this.state.health-13);this.state.sanity=Math.max(0,this.state.sanity-8);this.spiderStage=2;this.spiderNextAt=Date.now()+42000;this.notify('Ты вырвался. Нити распороли рукав, но не удержали тебя.','ok');}
        else{this.state.health=Math.max(1,this.state.health-24);this.spiderStage=3;this.spiderNextAt=Date.now()+18000;this.notify('Она догнала тебя у поворота. Теперь придётся драться.','warn');}
      } else if(action==='surrender'){
        const risk=Math.min(.88,(this.state.sanity<30?.72:this.state.sanity<55?.54:.32)+(this.maskWorn?.1:0));
        if(Math.random()<risk){this.state.health=0;this.state.sanity=0;this.notify('Она обещает вывести тебя. За дверью нет коридора — только натянутые нити.','warn');saveState(this.state);this.renderVitals();this.checkDefeat();return;}
        this.state.health=Math.max(1,this.state.health-16);this.state.sanity=Math.max(0,this.state.sanity-18);this.spiderInCombat=true;this.notify('Ты вырвал руку, но нити уже держат запястье.','warn');this.startCombat();return;
      }
    }
    saveState(this.state);this.renderVitals();this.renderInv();
  }

  private startWorldClock() {
    const update = () => {
      const d = new Date();
      const time = document.getElementById('worldTime');
      const date = document.getElementById('worldDate');
      if (time) time.textContent = d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      if (date) date.textContent = d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});
    };
    update();
    if (this.worldClockTimer) clearInterval(this.worldClockTimer as number);
    this.worldClockTimer = setInterval(update, 15000);
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

  private startThreat(kind: 'light' | 'sound' | 'dweller' = 'dweller') {
    if (document.body.classList.contains('combat-active') || this.threatActive) return;
    this.threatKind = kind;
    this.threatActive = true;
    this.noiseEncounterPending = false;
    this.updateAwareness(2); this.state.sanity = Math.max(0,this.state.sanity-5);
    this.state.flags['encounter_' + kind] = true;
    this.state.flags['encounter_' + kind + '_yokai'] = true;
    saveState(this.state); this.renderVitals();
    if (kind === 'light') simAudio.monsterBlind(this.state.muted);
    else if (kind === 'sound') simAudio.monsterListener(this.state.muted);
    else simAudio.monsterDweller(this.state.muted);
    this.showSense('◉','Что-то движется в темноте',true); this.pulseMatrix('alert');
    this.showCreatureInScene();
    document.body.classList.remove('threat-kind-light','threat-kind-sound','threat-kind-dweller');
    document.body.classList.add('threat-active','threat-kind-' + kind);
    const radar = document.getElementById('radarSignal'); if (radar) radar.textContent = kind === 'light' ? 'СВЕТ ОБНАРУЖЕН' : kind === 'sound' ? 'ШУМ ЗАСЕЧЁН' : 'ПРИСУТСТВИЕ РЯДОМ';
    const panel=document.getElementById('threatOverlay');
    const title=document.getElementById('threatTitle');
    const copy=document.getElementById('threatText');
    if(title) title.textContent=kind==='light'?'ЮРЭЙ ИДЁТ НА СВЕТ':kind==='sound'?'КИДЗЁ СЛЫШИТ ТЕБЯ':'РОКУДЗЁ ВЫХОДИТ ИЗ ТЕНИ';
    if(copy) copy.textContent=kind==='light'?'Юрэй в погребальном саване тянется к свету. Погаси источник и не двигайся.':kind==='sound'?'Кидзё уловила твой голос. Замри или попробуй отвлечь демоницу.':'Рокудзё слишком долго наблюдала из соседней комнаты. Теперь она рядом.';
    panel?.classList.add('open'); panel?.setAttribute('aria-hidden','false');
    this.startThreatApproach();
  }

  private resolveThreat(choice: 'hide' | 'confront') {
    if(!this.threatActive)return;
    if (this.threatApproachTimer) clearInterval(this.threatApproachTimer as number);
    this.threatApproachTimer = 0;
    if (choice === 'confront') { this.startCombat(); return; }
    this.threatActive=false;
    this.threatCooldown=Date.now() + Math.max(8500, 28000 - this.currentSoundLevel * 195);
    document.getElementById('threatOverlay')?.classList.remove('open');
    document.getElementById('threatOverlay')?.setAttribute('aria-hidden','true');
    document.body.classList.remove('threat-active','threat-kind-light','threat-kind-sound','threat-kind-dweller');
    this.updateAwareness(Date.now() < this.noiseUntil ? 1 : 0);
    document.getElementById('sceneCreature')?.remove();
    const radar = document.getElementById('radarSignal'); if (radar) radar.textContent = 'СИГНАЛ СТАБИЛЕН';
    if (this.threatKind === 'sound') {
      this.noiseUntil = 0;
      this.notify('Ты замер. Кидзё потеряла источник шума.', 'ok');
    } else if (Math.random() < .78) {
      simAudio.whisper(this.state.muted);
      this.notify('Ты затаился. Шаги медленно удаляются.', 'ok');
      this.state.sanity = Math.max(0, this.state.sanity - 1);
    } else {
      simAudio.monster(this.state.muted);
      this.notify('Оно заметило движение!', 'warn');
      this.state.health = Math.max(0, this.state.health - 9);
      this.state.sanity = Math.max(0, this.state.sanity - 7);
    }
    saveState(this.state);this.renderVitals();
  }

  private spawnInspectBurst(x: number, y: number) {
    const burst = document.createElement('div');
    burst.className = 'inspect-burst';
    burst.style.left = x + '%';
    burst.style.top = y + '%';
    for (let i = 0; i < 9; i++) {
      const particle = document.createElement('i');
      particle.style.setProperty('--particle-angle', (i * 40 + Math.random() * 12) + 'deg');
      particle.style.setProperty('--particle-distance', (18 + Math.random() * 26) + 'px');
      burst.appendChild(particle);
    }
    this.stage.appendChild(burst);
    window.setTimeout(() => burst.remove(), 720);
  }

  private ensurePerceptionOverlay() {
    if (!document.getElementById('awarenessIndicator')) {
      const eye = document.createElement('div');
      eye.id = 'awarenessIndicator';
      eye.className = 'awareness-indicator';
      eye.dataset.state = 'hidden';
      eye.setAttribute('role', 'status');
      eye.setAttribute('aria-live', 'polite');
      eye.innerHTML = '<svg class="awareness-eye" viewBox="0 0 32 20" aria-hidden="true" focusable="false"><path class="eye-outline" d="M1 10 C5 3.8 10.2 1 16 1 C21.8 1 27 3.8 31 10 C27 16.2 21.8 19 16 19 C10.2 19 5 16.2 1 10Z"/><circle class="eye-iris" cx="16" cy="10" r="4.2"/><circle class="eye-pupil" cx="16" cy="10" r="1.8"/><path class="eye-lid" d="M1 10 Q16 10 31 10"/></svg><span data-eye-label>НЕ ЗАМЕЧЕНЫ</span>';
      document.body.appendChild(eye);
    }
    if (!document.getElementById('ambientFx')) {
      const fx = document.createElement('div');
      fx.id = 'ambientFx';
      fx.className = 'ambient-fx';
      fx.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 18; i++) {
        const particle = document.createElement('i');
        particle.className = 'ambient-particle';
        particle.style.setProperty('--x', (Math.random() * 100) + '%');
        particle.style.setProperty('--y', (Math.random() * 100) + '%');
        particle.style.setProperty('--delay', (-Math.random() * 18) + 's');
        particle.style.setProperty('--duration', (12 + Math.random() * 15) + 's');
        particle.style.setProperty('--size', (1 + Math.random() * 2.5) + 'px');
        fx.appendChild(particle);
      }
      this.stage.appendChild(fx);
    }
    if (!document.getElementById('crtInterference')) {
      const crt = document.createElement('div');
      crt.id = 'crtInterference';
      crt.className = 'crt-interference';
      crt.setAttribute('aria-hidden', 'true');
      this.stage.appendChild(crt);
    }
  }

  private updateAwareness(level: 0 | 1 | 2) {
    const eye = document.getElementById('awarenessIndicator');
    if (!eye) return;
    eye.dataset.state = level === 2 ? 'seen' : level === 1 ? 'near' : 'hidden';
    const label = eye.querySelector('[data-eye-label], #awarenessLabel');
    if (label) label.textContent = level === 2 ? 'ОБНАРУЖЕНЫ' : level === 1 ? 'КТО-ТО РЯДОМ' : 'НЕ ЗАМЕЧЕНЫ';
    eye.setAttribute('aria-label', level === 2 ? 'Существо заметило нас' : level === 1 ? 'Кто-то приближается' : 'Нас не заметили');
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
    if (this.matrixTimer) clearInterval(this.matrixTimer as number);
    this.matrixTimer = setInterval(() => {
      fill(left);
      fill(right);
    }, 2000);
  }

  pulseMatrix(mode: 'idle' | 'alert' | 'ok') {
    document.body.dataset.matrix = mode;
    if (mode !== 'idle') setTimeout(() => { document.body.dataset.matrix = 'idle'; }, 2000);
  }

  private filePersonalNote(flag: string, label: string, text: string) {
    try {
      const key = 'limbo_employee_notes_v1';
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      const rows = Array.isArray(saved) ? saved.filter((row: any) => row && row.flag !== flag) : [];
      rows.push({ flag, label, text, location: this.state.location, createdAt: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(rows.slice(-120)));
    } catch { /* The current run journal remains available if storage is full. */ }
    this.state.flags['filed_' + flag] = true;
    this.rememberThought(label + ': ' + text);
  }

  private rememberThought(text: string) {
    const value = text.trim(); if (!value) return;
    this.state.memories = this.state.memories || [];
    if (this.state.memories.includes(value)) return;
    this.state.memories.push(value); if (this.state.memories.length > 80) this.state.memories = this.state.memories.slice(-80);
    saveState(this.state); this.renderThoughtJournal();
  }

  private ensureThoughtJournal() {
    const inventory = document.querySelector<HTMLElement>('.hud-inventory');
    const heading = inventory?.querySelector<HTMLElement>('.inventory-heading');
    if (!inventory || !heading) return;
    let button = document.getElementById('thoughtJournalToggle') as HTMLButtonElement | null;
    if (!button) {
      button = document.createElement('button'); button.id = 'thoughtJournalToggle'; button.type = 'button'; button.className = 'thought-journal-toggle';
      button.innerHTML = 'МЫСЛИ <b id="thoughtJournalCount">0</b>';
      heading.appendChild(button);
    }
    let panel = document.getElementById('thoughtJournal') as HTMLElement | null;
    if (!panel) {
      panel = document.createElement('section'); panel.id = 'thoughtJournal'; panel.className = 'thought-journal'; panel.setAttribute('aria-label', 'Журнал мыслей');
      panel.innerHTML = '<div class="thought-journal-head"><strong>МЫСЛИ И ЗАМЕТКИ</strong><button type="button" aria-label="Закрыть">×</button></div><p class="thought-journal-intro">Только то, что удалось заметить, прочитать или понять.</p><div class="thought-journal-list" id="thoughtJournalList"></div>';
      document.body.appendChild(panel);
      panel.querySelector('button')?.addEventListener('click', () => { panel?.classList.remove('open'); button?.setAttribute('aria-expanded', 'false'); });
    }
    button.onclick = () => {
      const open = !panel!.classList.contains('open');
      panel!.classList.toggle('open', open);
      button!.setAttribute('aria-expanded', String(open));
      if (open) this.renderThoughtJournal();
    };
    if (panel.dataset.outsideCloseBound !== '1') {
      panel.dataset.outsideCloseBound = '1';
      document.addEventListener('pointerdown', (event) => {
        const target = event.target as Node;
        if (panel!.classList.contains('open') && !panel!.contains(target) && !button!.contains(target)) {
          panel!.classList.remove('open');
          button!.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panel!.classList.contains('open')) {
          panel!.classList.remove('open');
          button!.setAttribute('aria-expanded', 'false');
        }
      });
    }
    this.renderThoughtJournal();
  }

  private renderThoughtJournal() {
    const count = document.getElementById('thoughtJournalCount');
    const list = document.getElementById('thoughtJournalList');
    const memories = this.state.memories || [];
    const notes: Array<[string,string]> = [
      ['Записка кокэси', 'note_read'],
      ['Записка у водостока', 'clue_note_gate'],
      ['Записка под камнем', 'clue_note_garden'],
      ['Записка под карнизом', 'clue_note_engawa'],
      ['Записка у якоря', 'clue_note_storage'],
      ['Подсказка о половинах ключа', 'clue_key_halves'],
      ['Ритм дождя', 'clue_rain_rhythm'],
      ['Предупреждение о тени', 'clue_shadow_warning'],
      ['Ответ эха', 'clue_echo_answered']
    ];
    const noteRows = notes.filter(([,flag]) => !!this.state.flags[flag]).map(([label]) => label);
    const easterLabels: Record<string,string> = {
      easter_mirror: 'Отражение из другого времени',
      spider_recognized: 'Дзерогумо узнала тебя',
      spider_story_heard: 'История Дзерогумо',
      spider_thread_given: 'Нить, отданная тени',
      heard_steps: 'Шаги над потолком',
      mask_voice_known: 'Голос из маски',
      gutter_puzzle_solved: 'Тайна водостока',
      anchor_puzzle_solved: 'Стабилизация якоря'
    };
    const openedEaster = Object.keys(easterLabels).filter(key => !!this.state.flags[key]).map(key => easterLabels[key]);
    const total = memories.length + noteRows.length + openedEaster.length;
    if (count) count.textContent = String(total);
    if (!list) return;
    list.innerHTML = '';
    const group = (title: string, rows: string[]) => {
      if (!rows.length) return;
      const details = document.createElement('details');
      details.className = 'thought-journal-group';
      const summary = document.createElement('summary');
      summary.textContent = title + ' · ' + rows.length;
      const content = document.createElement('div');
      content.className = 'thought-journal-group-content';
      rows.forEach(value => {
        const p = document.createElement('p');
        p.className = 'thought-journal-row';
        p.textContent = value;
        content.appendChild(p);
      });
      details.append(summary, content);
      list.appendChild(details);
    };
    group('ЗАМЕТКИ', noteRows);
    group('ОТКРЫТЫЕ ПАСХАЛКИ', openedEaster);
    const notePrefixes = notes.map(([label]) => label + ':');
    const thoughtRows = memories.filter(memory => !notePrefixes.some(prefix => memory.startsWith(prefix))).slice().reverse()
      .map((memory, index) => 'ЗАПИСЬ ' + String(memories.length - index).padStart(2, '0') + ' · ' + memory);
    group('МЫСЛИ', thoughtRows);
    const studiedFacts = (Object.keys(ITEMS) as ItemId[])
      .filter(id => !!this.state.flags['studied_' + id])
      .map(id => ITEMS[id].name + ': предмет изучен. ' + ITEMS[id].examine);
    const facts = [
      ...studiedFacts,
      ...(this.state.flags.black_seed_taken || this.state.flags.took_black_seed ? ['Чёрное семя: опасный объект найден. При контакте снижает рассудок; изучение показывает живые жилки под плёнкой.'] : []),
      ...(this.state.flags.used_black_seed ? ['Чёрное семя применено. Последствия применения отмечены в журнале состояния.'] : []),
      ...(this.state.flags.took_stitched_mask || this.state.inventory.includes('stitched_mask') ? ['Сшитая маска: опасный объект найдена. Надевание снижает рассудок, длительное ношение усиливает воздействие.'] : []),
      ...(this.state.flags.mask_voice_known ? ['Голос маски изучен: субъект распознаёт ответ изнутри маски.'] : []),
      ...(this.state.flags.spider_story_heard ? ['Дзерогумо: услышана история о двери, которую она удерживала для ушедших.'] : []),
      ...(this.state.flags.spider_hand_taken ? ['Контакт с Дзерогумо: принята протянутая рука; возможны последствия.'] : []),
      ...(this.state.flags.anchor_puzzle_solved ? ['Якорь RK-01 стабилизирован: приняты сигналы предупреждения, защиты и света.'] : [])
    ];
    if (facts.length) {
      const extra = document.createElement('details');
      extra.className = 'thought-journal-group thought-journal-extra';
      const summary = document.createElement('summary');
      summary.textContent = 'ДОПОЛНИТЕЛЬНЫЕ ДАННЫЕ · ОПАСНОЕ И ИЗУЧЕННОЕ · ' + facts.length;
      const content = document.createElement('div');
      content.className = 'thought-journal-group-content';
      facts.forEach(value => {
        const p = document.createElement('p');
        p.className = 'thought-journal-row';
        p.textContent = value;
        content.appendChild(p);
      });
      extra.append(summary, content);
      list.appendChild(extra);
    }
    if (!list.children.length) {
      const empty = document.createElement('p');
      empty.className = 'thought-journal-empty';
      empty.textContent = 'Пока нет сохранённых мыслей и заметок.';
      list.appendChild(empty);
    }
  }

  notify(msg: string, kind: 'info' | 'warn' | 'ok' = 'info') {
    const host = document.getElementById('notifyHost');
    if (!host) return;
    const now = Date.now();
    // Suppress identical events emitted by two systems during the same update.
    if (msg === this.lastNotification && now - this.lastNotificationAt < 1400) return;
    this.lastNotification = msg;
    this.lastNotificationAt = now;
    this.notificationQueue.push({ message: msg, kind });
    if (!this.notificationBusy) this.showNextNotification();
  }

  private showNextNotification() {
    const host = document.getElementById('notifyHost');
    if (!host || this.notificationBusy || !this.notificationQueue.length) return;
    this.notificationBusy = true;
    const entry = this.notificationQueue.shift()!;
    const n = document.createElement('div');
    n.className = 'notify ' + entry.kind;
    n.setAttribute('role', 'status');
    n.textContent = entry.message;
    host.replaceChildren(n);
    requestAnimationFrame(() => n.classList.add('show'));
    window.setTimeout(() => {
      n.classList.add('leaving');
      window.setTimeout(() => {
        n.remove();
        this.notificationBusy = false;
        this.showNextNotification();
      }, 300);
    }, 2600);
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
    this.parallax.setWeather(loc.ambient.toLowerCase().includes('rain') || loc.ambient === 'wood');
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
    const files: Record<ItemId, string> = {
      paper_lantern_shard: 'lantern_shard', mirror_shard: 'mirror_shard', mirror_shard_before_fire: 'mirror_shard', mirror_shard_after_fire: 'mirror_shard', mirror_lens: 'mirror_shard', wet_key_half: 'key_half_1', wet_key_other: 'key_half_2',
      ryokan_key: 'key', kokeshi_note: 'letter', silk_thread: 'rope', matchbox: 'matches',
      medicinal_herbs: 'herbs', copper_bell: 'bell', herbal_poultice: 'bandage',
      warding_charm: 'amulet', ember_lantern: 'lantern', black_seed: 'black_seed',
      stitched_mask: 'doll',
    };
    return '/assets/game/items/' + (files[id] || 'mirror_shard') + '.png';
  }

  private renderDroppedItems() {
    this.stage.querySelectorAll('.dropped-world-item').forEach(node => node.remove());
    for (const drop of this.state.droppedItems.filter(item => item.location === this.state.location)) {
      const button=document.createElement('button');
      button.type='button'; button.className='dropped-world-item'; button.style.left=drop.x+'%'; button.style.top=drop.y+'%';
      const def=ITEMS[drop.id];
      button.innerHTML='<img src="'+this.itemAsset(drop.id)+'" alt=""><span>'+def.name+'</span>';
      button.title=def.name+' · подобрать';
      button.addEventListener('click',()=>{
        if(this.state.inventory.length>=12){this.notify('Инвентарь заполнен. Сначала освободи место.','warn');return;}
        this.state.droppedItems=this.state.droppedItems.filter(x=>x!==drop);
        this.state.inventory.push(drop.id); this.state.flags['collected_'+drop.id]=true;
        this.applyDangerousPickup(drop.id);
        saveState(this.state); this.renderDroppedItems(); this.renderInv();
        if (drop.id !== 'black_seed' && drop.id !== 'stitched_mask') this.notify('Поднято: '+def.name,'ok');
        simAudio.take(this.state.muted);
      });
      this.stage.appendChild(button);
    }
  }

  private dropItem(id: ItemId, clientX?: number, clientY?: number) {
    if(!this.state.inventory.includes(id)) return;
    const rect=this.stage.getBoundingClientRect();
    let x=clientX===undefined?48+Math.random()*10:Math.max(5,Math.min(94,((clientX-rect.left)/rect.width)*100));
    let y=clientY===undefined?78+Math.random()*5:Math.max(12,Math.min(88,((clientY-rect.top)/rect.height)*100));
    const collides=(px:number,py:number)=>{
      const nearExit=LOCATIONS[this.state.location].exits.some(ex=>Math.abs(px-ex.x)<10&&Math.abs(py-ex.y)<12);
      const nearHotspot=hotspotsFor(this.state.location).some(hs=>px>=hs.x-5&&px<=hs.x+hs.w+5&&py>=hs.y-7&&py<=hs.y+hs.h+7);
      return nearExit||nearHotspot;
    };
    if(collides(x,y)){
      const safeSpots:[[number,number],[number,number],[number,number],[number,number],[number,number]]=[[34,86],[52,88],[70,86],[42,24],[62,30]];
      const safe=safeSpots.find(([px,py])=>!collides(px,py));
      if(safe){[x,y]=safe;}
    }
    { const at=this.state.inventory.indexOf(id); if(at>=0)this.state.inventory.splice(at,1); }
    if(this.state.selected===id)this.state.selected=null;
    this.state.droppedItems.push({id,location:this.state.location,x,y});
    this.state.flags['dropped_'+id]=true; saveState(this.state);
    this.renderInv(); this.renderDroppedItems();
    this.notify('Оставлено на месте: '+ITEMS[id].name+'. Можно вернуться и подобрать.','info');
  }

  private echo() {
    simAudio.call(this.state.muted);
    this.makeNoise('Ты посылаешь короткое эхо по помещению. Ответ приходит не сразу.');
    this.state.flags.used_echo=true;
    if(!this.state.flags.clue_echo_answered && this.state.visited.length>=3 && Math.random()<.22){
      this.state.flags.clue_echo_answered=true;
      this.notify('Эхо возвращается тремя ударами. Где-то в доме есть ответ на этот ритм.','ok');
    }
    saveState(this.state);
  }

  private buildHotspots() {
    this.hsLayer.innerHTML = '';
    for (const hs of hotspotsFor(this.state.location)) {
      if (hs.id === 'hs_door' && this.state.flags.door_unlocked) continue;
      if (hs.clueFlag && this.state.flags['filed_' + hs.clueFlag]) continue;
      const allFinds = hs.items?.length ? hs.items : (hs.item ? [hs.item] : []);
      const allFlags = hs.takenFlags?.length ? hs.takenFlags : (hs.takenFlag ? [hs.takenFlag] : []);
      if (allFinds.length && allFlags.length && allFinds.every((_, i) => !!this.state.flags[allFlags[i] || ''])) continue;
      if (!allFinds.length && hs.takenFlag && this.state.flags[hs.takenFlag]) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className =
        'hotspot' +
        (hs.id === 'hs_anchor' ? ' anchor-target' : '') +
        (hs.complete ? ' complete' : '') +
        (hs.useWith ? ' door' : '') +
        (hs.item ? ' loot' : '') +
        (hs.art ? ' note-marker' : '');
      b.style.left = hs.x + '%';
      b.style.top = hs.y + '%';
      b.style.width = hs.w + '%';
      b.style.height = hs.h + '%';
      const firstAvailable = allFinds.find((id, index) => {
        const flag = allFlags[index] || hs.takenFlag;
        return !flag || !this.state.flags[flag];
      });
      const inspected = !!this.state.flags['inspected_' + hs.id];
      b.dataset.hotspotId = hs.id;
      b.setAttribute('aria-label', (allFinds.length ? 'Осмотреть находку: ' : 'Осмотреть: ') + hs.label);
      if (inspected) b.classList.add('inspected');
      const itemMarkup = hs.art
        ? `<span class="world-note-art"><img src="${hs.art}" alt="" draggable="false"></span>`
        : inspected && firstAvailable
          ? `<span class="world-loot-art"><img src="${this.itemAsset(firstAvailable)}" alt="" draggable="false"></span>`
          : '<span class="hotspot-reticle" aria-hidden="true"><i></i></span>';
      b.innerHTML = itemMarkup + `<span class="hotspot-world-label">${hs.label}<small>НАЖМИТЕ, ЧТОБЫ ОСМОТРЕТЬ</small></span>`;
      b.setAttribute('aria-label', 'Осмотреть: ' + hs.label);
      b.title = 'Можно осмотреть: ' + hs.label;
      b.addEventListener('mouseenter', () => {
        simAudio.hover(this.state.muted);
        this.showHover(hs, b);
      });
      b.addEventListener('mouseleave', () => this.hideHover());
      b.addEventListener('contextmenu',(e)=>{if(hs.id==='hs_rain_gutter'){e.preventDefault();this.state.flags.clue_rain_rhythm=true;saveState(this.state);this.notify('Три коротких удара и один длинный. Эхо повторяет рисунок желоба.','ok');this.echo();}});
      b.addEventListener('dragover',(e)=>{if(Array.from(e.dataTransfer?.types || []).includes('text/limbo-item')){e.preventDefault();b.classList.add('drop-target');}});
      b.addEventListener('dragleave',()=>b.classList.remove('drop-target'));
      b.addEventListener('drop',(e)=>{
        const id=e.dataTransfer?.getData('text/limbo-item') as ItemId;
        if(!id||!this.state.inventory.includes(id))return;
        e.preventDefault();e.stopPropagation();b.classList.remove('drop-target');this.state.selected=id;this.onHotspot(hs,b);
      });
      b.addEventListener('click', () => {
        this.hideHover();
        this.onHotspot(hs, b);
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
    // Ignore repeated clicks while a room transition is already loading.
    if (this.transitionBusy || this.threatActive || document.body.classList.contains('combat-active')) return;
    this.transitionBusy = true;
    try {
      // Distinct footsteps before the transition, followed by a soft movement whoosh.
      simAudio.steps(this.state.muted);
      window.setTimeout(() => simAudio.steps(this.state.muted), 230);
      window.setTimeout(() => simAudio.steps(this.state.muted), 470);
      window.setTimeout(() => simAudio.whoosh(this.state.muted), 590);
      this.makeNoise('Шаги эхом разнеслись по локации.');
      this.state.location = to;
      this.roomEnteredAt = Date.now();
      this.noiseStartedAt = Date.now(); this.noiseDuration = 11000; this.noisePeak = 58;
      this.noiseUntil = this.noiseStartedAt + this.noiseDuration;
      this.noiseEncounterPending = true;
      this.noiseEncounterExpiresAt = this.noiseUntil;
      if (!this.state.visited.includes(to)) this.state.visited.push(to);
      saveState(this.state);
      this.stage.classList.add('fade');
      const flash = document.getElementById('revealFlash');
      if (flash) {
        flash.classList.add('on');
        window.setTimeout(() => flash.classList.remove('on'), 500);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      await this.loadLoc(to);
      this.buildHotspots();
      this.buildExits();
      this.renderDroppedItems();
      this.renderMinimap();
      this.updateZone();
      this.stage.classList.remove('fade');
      this.stage.classList.add('reveal');
      window.setTimeout(() => this.stage.classList.remove('reveal'), 600);
      this.pulseMatrix('ok');
      simAudio.open(this.state.muted);
    } catch (error) {
      console.error('[LIMBO] Room transition failed:', error);
      this.notify('Кадр комнаты не загрузился. Интерфейс восстановлен; попробуй перейти ещё раз.', 'warn');
      this.scheduleInterfaceRecovery(true);
    } finally {
      this.stage.classList.remove('fade');
      this.transitionBusy = false;
    }
  }

  private onHotspot(hs: HotspotDef, element?: HTMLButtonElement) {
    simAudio.click(this.state.muted);
    this.state.flags['inspected_' + hs.id] = true;
    this.state.flags['examined_' + hs.id] = true;
    saveState(this.state);
    if (hs.complete && !this.state.selected) {
      if (this.state.flags.anchor_puzzle_solved) {
        this.showEndingChoices();
      } else {
        this.openModal(hs);
        this.showAnchorPuzzle(hs);
      }
      return;
    }
    this.spawnInspectBurst(hs.x, hs.y);

    // Contextual item use: these interactions are intentionally tied to visible world objects.
    const selected = this.state.selected;
    if (hs.id === 'hs_anchor' && selected) {
      this.syncAnchorProgress();
      const sequence: Array<{ id: ItemId; flag: string; thought: string }> = [
        { id: 'copper_bell', flag: 'anchor_step_bell', thought: 'Колокольчик — первый ответ. Якорь слышит не звук, а намерение предупредить.' },
        { id: 'warding_charm', flag: 'anchor_step_charm', thought: 'Оберег удерживает контур. Три комнаты — три свидетельства; нить связывает их.' },
        { id: 'ember_lantern', flag: 'anchor_step_lantern', thought: 'Свет замыкает последовательность. Якорь больше не зовёт — он отвечает.' },
      ];
      const next = sequence.find(step => !this.state.flags[step.flag]);
      if (!next) { this.state.selected = null; saveState(this.state); this.showEndingChoices(); return; }
      if (selected !== next.id) {
        this.notify('Якорь не принимает этот предмет. Порядок важен: звук → защита → свет.', 'warn');
        return;
      }
      this.state.flags[next.flag] = true;
      this.state.flags['used_' + selected] = true;
      this.state.flags['used_on_hs_anchor'] = true;
      { const at = this.state.inventory.indexOf(selected); if (at >= 0) this.state.inventory.splice(at, 1); }
      this.state.selected = null;
      this.rememberThought(next.thought);
      const solved = sequence.every(step => !!this.state.flags[step.flag]);
      if (solved) {
        this.state.flags.anchor_puzzle_solved = true;
        this.rememberThought('Последовательность замкнулась. Теперь можно покинуть Рёкан.');
        this.notify('ЯКОРЬ СТАБИЛИЗИРОВАН · ВЫХОД ОТКРЫТ', 'ok');
        // Exit is a hard audio boundary: do not play completion or ambient cues after closure.
      } else this.notify('Элемент принят. Якорь ждёт следующий сигнал.', 'ok');
      saveState(this.state);
      this.renderInv(); this.renderVitals();
      if (solved) this.showEndingChoices();
      else { this.openModal(hs); this.showAnchorPuzzle(hs); }
      return;
    }
    const contextual: Partial<Record<ItemId, Partial<Record<string, { flag: string; message: string; consume?: boolean; sanity?: number }>>>> = {
      silk_thread: {
        hs_note: { flag: 'threaded_note', message: 'Ты закрепил записку нитью. На обороте проступила строка: «Якорь слушает то, что принесено из трёх комнат».' },
        hs_footprint_wall: { flag: 'clue_shadow_warning', message: 'Ты натягиваешь нить между отпечатками. Она дрожит только там, где тень должна была бы стоять.' },
      },
      matchbox: {
        hs_lantern: { flag: 'world_lantern_lit', message: 'Сырая спичка вспыхивает на миг. Внутри фонаря проявляется знак Цефея.', consume: true },
      },
      warding_charm: {
        hs_anchor: { flag: 'anchor_warded', message: 'Оберег впитывается в контур якоря. Шёпот на секунду стихает.', consume: true },
      },
      ember_lantern: {
        hs_anchor: { flag: 'anchor_lit', message: 'Ты ставишь тлеющий фонарь в гнездо якоря. Контур удерживает свет.', consume: true },
        hs_mirror_panel: { flag: 'easter_mirror', message: 'Свет касается стекла. В отражении фигура поднимает руку раньше тебя. На стекле проступает: «ОНА УЖЕ ВНУТРИ».' },
      },
      mirror_lens: {
        hs_mirror_panel: { flag: 'easter_mirror', message: 'Линза входит в трещину потемневшего стекла. Отражение собирается в одно целое: фигура поднимает руку раньше тебя.', consume: true },
      },
      copper_bell: {
        hs_anchor: { flag: 'anchor_warned', message: 'Безъязыкий колокольчик дрожит у якоря. Изнутри отвечают тремя ударами.' },
        hs_rain_gutter: { flag: 'clue_rain_rhythm', message: 'Ты прикладываешь колокольчик к желобу. Металл отвечает тремя короткими ударами и одним длинным.' },
      },
      black_seed: {
        hs_anchor: { flag: 'anchor_seeded', message: 'Семя проваливается в сердцевину якоря. Цефей произносит твоё имя чужим голосом.', consume: true, sanity: -18 },
      },
      stitched_mask: {
        hs_anchor: { flag: 'anchor_masked', message: 'Маска касается якоря. Из-под бумаги звучит: «Теперь я знаю, кто смотрит».', sanity: -8 },
      },
    };
    const contextualUse = selected ? contextual[selected]?.[hs.id] : undefined;
    if (selected && contextualUse) {
      this.state.flags['used_' + selected] = true;
      this.state.flags['used_on_' + hs.id] = true;
      this.state.flags[contextualUse.flag] = true;
      if (contextualUse.consume) { const at = this.state.inventory.indexOf(selected); if (at >= 0) this.state.inventory.splice(at, 1); }
      if (contextualUse.sanity) this.state.sanity = Math.max(0, this.state.sanity + contextualUse.sanity);
      this.state.selected = null;
      saveState(this.state);
      this.notify(contextualUse.message, contextualUse.sanity ? 'warn' : 'ok');
      this.renderInv();
      this.renderVitals();
      this.buildHotspots();
      this.pulseMatrix(contextualUse.sanity ? 'alert' : 'ok');
      return;
    }

    if (this.state.selected && hs.useWith?.length) {
      if (hs.useWith.includes(this.state.selected)) {
        this.state.flags['used_' + this.state.selected] = true;
        this.state.flags['used_on_' + hs.id] = true;
        if (hs.useFlag) this.state.flags[hs.useFlag] = true;
        if (hs.id === 'hs_door') this.state.flags.door_unlocked = true;
        this.state.selected = null;
        saveState(this.state);
        simAudio.door(this.state.muted);
        this.notify(hs.useSuccess || 'Сработало', 'ok');
        this.pulseMatrix('ok');
        this.buildExits();
        this.buildHotspots();
        this.renderInv();
        this.syncHand();
        return;
      }
      simAudio.deny(this.state.muted);
      this.notify('Это сюда не подходит', 'warn');
      return;
    }

    this.buildHotspots();
    this.openModal(hs);
  }

  private openModal(hs: HotspotDef) {
    const modal = document.getElementById('simModal')!;
    const title = document.getElementById('modalTitle')!;
    const body = document.getElementById('modalBody')!;
    const visual = document.getElementById('modalVisual');
    const actions = document.getElementById('modalActions')!;
    const note = document.getElementById('modalNote');
    const found = hs.items?.length ? hs.items : (hs.item ? [hs.item] : []);
    const flags = hs.takenFlags?.length ? hs.takenFlags : (hs.takenFlag ? [hs.takenFlag] : []);
    body.classList.remove('note-reading');
    if (visual) visual.innerHTML = '';

    const addAction = (label: string, variant: 'primary'|'secondary'|'quiet', fn: () => void) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inspection-action ' + variant;
      button.textContent = label;
      button.addEventListener('click', fn);
      actions.appendChild(button);
      return button;
    };
    const availableFinds = () => found.filter((id, index) => {
      const flag = flags[index] || hs.takenFlag;
      return !flag || !this.state.flags[flag];
    });
    const setSceneArt = () => {
      if (!visual) return;
      visual.innerHTML = '<div class="inspection-scan" aria-hidden="true"><span></span><i></i><b></b></div><small class="inspection-scan-label">СЛЕДЫ · RK-01</small>';
    };
    const showArea = () => {
      if (hs.id === 'hs_anchor' && this.state.flags.anchor_puzzle_solved) {
        this.showEndingChoices();
        return;
      }
      title.textContent = 'ОСМОТР · ' + hs.label;
      setSceneArt();
      body.innerHTML = '';
      const description = document.createElement('p');
      description.className = 'inspection-description';
      description.textContent = hs.examine;
      body.appendChild(description);
      actions.innerHTML = '';

      const available = availableFinds();
      if (available.length) {
        const heading = document.createElement('div');
        heading.className = 'discovery-heading';
        heading.innerHTML = '<span>ОБНАРУЖЕНО</span><b>' + available.length.toString().padStart(2,'0') + '</b>';
        body.appendChild(heading);
        const list = document.createElement('div');
        list.className = 'discovery-list';
        available.forEach((id) => {
          const item = ITEMS[id];
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'discovery-row';
          const art = document.createElement('img');
          art.src = this.itemAsset(id);
          art.alt = '';
          art.draggable = false;
          const copy = document.createElement('span');
          copy.className = 'discovery-copy';
          const name = document.createElement('strong');
          name.textContent = item?.name || 'Неизвестная находка';
          const prompt = document.createElement('small');
          prompt.textContent = 'ОСМОТРЕТЬ НАХОДКУ';
          copy.append(name,prompt);
          const arrow = document.createElement('span');
          arrow.className = 'discovery-arrow';
          arrow.textContent = '↗';
          row.append(art,copy,arrow);
          row.addEventListener('click', () => {
            const originalIndex = found.findIndex((candidate, index) => candidate === id && (!flags[index] || !this.state.flags[flags[index]]));
            showItem(id, originalIndex);
          });
          list.appendChild(row);
        });
        body.appendChild(list);
        addAction('ОСТАВИТЬ ВСЁ КАК ЕСТЬ', 'quiet', () => {
          this.notify('Мы решили пока ничего не трогать.', 'info');
          this.closeModal();
        });
        if (note) note.textContent = 'Среди следов есть что-то ещё. Каждую находку можно рассмотреть отдельно.';
      } else if (hs.complete) {
        if (this.state.flags.anchor_puzzle_solved) {
          addAction('ВЫЙТИ ИЗ СЕКТОРА', 'primary', () => this.showEndingChoices());
          if (note) note.textContent = 'Якорь стабилизирован. Теперь можно покинуть сектор.';
        } else {
          addAction('РАЗОБРАТЬСЯ С ЯКОРЕМ', 'primary', () => this.showAnchorPuzzle(hs));
          if (note) note.textContent = 'Выход заблокирован. Сначала восстанови последовательность: звук → защита → свет.';
        }
      } else {
        const empty = document.createElement('p');
        empty.className = 'discovery-empty';
        empty.textContent = hs.id === 'hs_rain_gutter'
          ? 'Дождевая вода идёт против уклона. Под краем вырезаны три короткие черты и одна длинная — тот же ритм, который возвращает эхо.'
          : hs.id === 'hs_footprint_wall'
          ? 'Мокрые отпечатки ладоней тянутся вверх по стене. Между ними повторяется знак закрытого глаза. Под последним отпечатком: «Не всякая тень хочет войти».'
          : hs.id === 'hs_mirror_panel'
          ? 'В стекле отражается коридор, которого нет за спиной. На миг видна фигура с перевязанными руками. Если направить сюда восстановленный свет, отражение исчезает.'
          : 'Больше ничего заметного. Но ощущение чужого присутствия не исчезает.';
        body.appendChild(empty);
        if (hs.id === 'hs_rain_gutter') {
          addAction(this.state.flags.gutter_puzzle_solved ? 'РИТМ УЖЕ ЗАПОМНЕН' : 'ВОСПРОИЗВЕСТИ РИТМ', 'primary', () => this.showGutterPuzzle(hs));
        }
        if(hs.id==='hs_rain_gutter'||hs.id==='hs_footprint_wall'||hs.id==='hs_mirror_panel'){
          addAction('ЗАПОМНИТЬ ЗНАК', 'primary', () => {
            this.state.flags['lore_'+hs.id]=true;
            this.rememberThought(hs.label + ': ' + hs.examine);
            if(hs.id==='hs_rain_gutter')this.state.flags.clue_rain_rhythm=true;
            if(hs.id==='hs_footprint_wall')this.state.flags.clue_shadow_warning=true;
            if(hs.id==='hs_mirror_panel')this.state.flags.easter_mirror=true;
            saveState(this.state);this.notify('Фрагмент сведений добавлен в память Цефея.','ok');this.closeModal();
          });
        }
        if (hs.clueFlag && hs.clueText) {
          addAction(this.state.flags[hs.clueFlag] ? 'ПЕРЕЧИТАТЬ ЗАПИСКУ' : 'ПРОЧИТАТЬ ЗАПИСКУ', 'primary', () => {
            title.textContent = hs.label.toUpperCase();
            body.innerHTML = '';
            body.classList.add('note-reading');
            if (visual) {
              visual.innerHTML = '';
              const image = document.createElement('img');
              image.className = 'note-reading-art';
              image.src = hs.art || '/assets/game/items/letter.png';
              image.alt = 'Сложенная записка';
              image.draggable = false;
              visual.appendChild(image);
            }
            const letter = document.createElement('article');
            letter.className = 'note-letter';
            const stamp = document.createElement('div');
            stamp.className = 'note-letter-stamp';
            stamp.textContent = 'ЗАПИСЬ · RK-01';
            const text = document.createElement('p');
            text.textContent = hs.clueText || '';
            letter.append(stamp, text);
            body.appendChild(letter);
            actions.innerHTML = '';
            addAction('ЗАПИСАТЬ В ЛИЧНОЕ ДЕЛО И ЗАБРАТЬ', 'primary', () => {
              this.state.flags[hs.clueFlag!] = true;
              this.state.flags['filed_' + hs.clueFlag!] = true;
              this.state.flags['collected_note_' + hs.id] = true;
              this.filePersonalNote(hs.clueFlag!, hs.label, hs.clueText || '');
              saveState(this.state); this.renderThoughtJournal(); this.buildHotspots();
              this.notify('Записка добавлена в личное дело. Бумага убрана с места находки.','ok');
              this.closeModal();
            });
            this.state.flags[hs.clueFlag!] = true;
            this.rememberThought(hs.label + ': ' + hs.clueText);
            saveState(this.state);
            this.renderThoughtJournal();
            if (note) note.textContent = 'Текст сохранён в заметках Цефея.';
            this.notify('Подсказка сохранена в заметках.', 'ok');
            simAudio.whisper(this.state.muted);
          });
        }
        addAction('ЗАКРЫТЬ ОСМОТР', 'quiet', () => this.closeModal());
        if (note) note.textContent = hs.clueFlag ? 'Записку можно прочитать и сохранить в заметках.' : 'Мы запомнили это место.';
      }
    };

    const showItem = (id: ItemId, selectedIndex?: number) => {
      const item = ITEMS[id];
      const index = selectedIndex ?? found.indexOf(id);
      const flag = flags[index] || hs.takenFlag;
      title.textContent = item?.name || 'НЕИЗВЕСТНАЯ НАХОДКА';
      if (visual) visual.innerHTML = '<img class="item-art-image inspection-item-art" src="' + this.itemAsset(id) + '" alt="">';
      body.innerHTML = '';
      const status = document.createElement('div');
      status.className = 'item-observation-label';
      status.textContent = 'НАЙДЕНО · ТРЕБУЕТ РЕШЕНИЯ';
      const description = document.createElement('p');
      description.className = 'inspection-description';
      description.textContent = item?.examine || 'Неизвестная находка.';
      body.append(status,description);
      if (id === 'kokeshi_note') {
        const read = document.createElement('button');
        read.type = 'button';
        read.className = 'inspection-action secondary note-read-action';
        read.textContent = this.state.flags.note_read ? 'ПЕРЕЧИТАТЬ ЗАПИСКУ' : 'ПРОЧИТАТЬ';
        read.addEventListener('click', () => {
          const letter = document.createElement('article');
          letter.className = 'note-letter';
          letter.innerHTML = '<div class="note-letter-stamp">ЛИЧНАЯ ЗАПИСЬ · М.</div><p>Дверь уже закрылась. Не верь шагам, которые повторяют твои: это не эхо, оно учится.</p><p>Первую половину ключа ищи у чёрной воды, вторую — под доской с тремя царапинами. Нить удержит бумагу; колокольчик предупредит того, кто умеет слушать.</p><p class="note-sign">М. · Не отвечай, если маска заговорит твоим голосом.</p>';
          body.querySelector('.note-letter')?.remove();
          body.appendChild(letter);
          this.state.flags.note_read = true;
          this.state.flags.clue_key_halves = true;
          saveState(this.state);
          read.textContent = 'ПЕРЕЧИТАТЬ ЗАПИСКУ';
          if (!body.querySelector('.file-note-action')) {
            const fileNote = document.createElement('button');
            fileNote.type = 'button';
            fileNote.className = 'inspection-action primary file-note-action';
            fileNote.textContent = 'ЗАПИСАТЬ В ЛИЧНОЕ ДЕЛО';
            fileNote.addEventListener('click', () => {
              this.filePersonalNote('note_read','Записка кокэси','Не верь повторяющимся шагам. Первая половина ключа — у чёрной воды, вторая — под доской с тремя царапинами. Нить удержит бумагу, а колокольчик предупредит того, кто слушает.');
              saveState(this.state); this.renderThoughtJournal();
              this.notify('Записка внесена в личное дело. Её можно забрать отдельно.','ok');
              fileNote.textContent = 'СОХРАНЕНО В ЛИЧНОМ ДЕЛЕ';
              fileNote.disabled = true;
            });
            body.appendChild(fileNote);
          }
          simAudio.whisper(this.state.muted);
          this.notify('Мы запомнили порядок: ключ → нить → бумага → огонь.','ok');
        });
        body.appendChild(read);
      }

      if (id === 'black_seed' || id === 'stitched_mask') {
        const risk = document.createElement('div');
        risk.className = 'item-risk';
        risk.innerHTML = '<span class="risk-mark">!</span><span>НЕИЗВЕСТНЫЙ ОБЪЕКТ · Возможна психическая реакция</span>';
        body.appendChild(risk);
      }

      actions.innerHTML = '';
      addAction('ВЗЯТЬ', 'primary', () => {
        if (this.state.inventory.length >= 12) {
          this.notify('Инвентарь заполнен', 'warn');
          return;
        }
        this.state.inventory.push(id);
        this.state.flags['collected_' + id] = true;
        if (id === 'black_seed' || id === 'stitched_mask') this.state.flags.took_dangerous_object = true;
        if (flag) this.state.flags[flag] = true;
        if (id === 'black_seed' || id === 'stitched_mask') this.applyDangerousPickup(id);
        else this.notify('Получено: ' + (item?.name || 'предмет'), 'ok');
        saveState(this.state);
        simAudio.take(this.state.muted);
        this.pulseMatrix('ok');
        this.closeModal();
        this.buildHotspots();
        this.renderInv();
        this.renderVitals();
      });

      addAction('ОСТАВИТЬ КАК ЕСТЬ', 'secondary', () => {
        this.notify('Мы оставили ' + (item?.name || 'находку') + ' на месте.', 'info');
        showArea();
      });

      addAction('ИЗУЧИТЬ', 'quiet', () => {
        if (body.querySelector('.item-detail')) return;
        const detail = document.createElement('div');
        detail.className = 'item-detail';
        detail.textContent = id === 'black_seed'
          ? 'Под плёнкой видны тонкие жилки. Они шевелятся в ответ на тепло руки. В голове возникает мысль: «посади меня».'
          : id === 'stitched_mask'
          ? 'Нить прошита изнутри. На бумаге проступает отпечаток лица, хотя маска лежит неподвижно. Мы отводим взгляд — и слышим собственный вдох изнутри неё.'
          : 'Мы поворачиваем находку в руках. На поверхности видны следы чужого использования. Под пальцами ощущается слабая вибрация.';
        body.appendChild(detail);
        this.state.flags['studied_' + id] = true;
        saveState(this.state);
        this.renderThoughtJournal();
        simAudio.whisper(this.state.muted);
        this.showSense('◉', 'Мы изучили: ' + (item?.name || 'находку'), false);
      });

      if (note) note.textContent = id === 'stitched_mask' || id === 'black_seed'
        ? 'Риск неизвестен. Можно забрать находку, изучить её или оставить.'
        : 'Решение остаётся за нами. Вещь не исчезнет, если мы уйдём без неё.';
    };

    body.classList.remove('thought-text');
    showArea();
    modal.hidden = false;
    modal.classList.remove('report-mode');
    modal.style.removeProperty('display');
    modal.classList.add('open');
    document.body.classList.add('inspection-open');
    simAudio.open(this.state.muted);
  }

  private showGutterPuzzle(hs: HotspotDef) {
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const visual = document.getElementById('modalVisual');
    const actions = document.getElementById('modalActions');
    const note = document.getElementById('modalNote');
    if (title) title.textContent = 'ВОДОСТОК · РИТМ ДОЖДЯ';
    if (visual) visual.innerHTML = '<div class="inspection-scan" aria-hidden="true"><span></span><i></i><b></b></div>';
    if (!body || !actions) return;
    body.innerHTML = ''; actions.innerHTML = '';
    const expected = this.state.gutterPattern;
    const intro = document.createElement('p'); intro.className = 'inspection-description';
    intro.textContent = 'Вода отбивает по металлу неровный ритм. Прислушайся и повтори последовательность ударами. При новом прохождении рисунок изменится.';
    body.appendChild(intro);
    const audioHint=document.createElement('div');audioHint.className='gutter-audio-hint';
    audioHint.innerHTML='<span class="gutter-audio-icon" aria-hidden="true">◖))</span><span><strong>УСЛЫШАТЬ РИТМ</strong><small>Последовательность насечек меняется каждый раз</small></span>';
    const listen=document.createElement('button');listen.type='button';listen.className='inspection-action primary gutter-listen';listen.textContent='ПРОСЛУШАТЬ ПОДСКАЗКУ';
    listen.addEventListener('click',()=>{
      simAudio.unlock();
      expected.forEach((beat,index)=>window.setTimeout(()=>{
        if(beat==='short')simAudio.shortTap(this.state.muted);else simAudio.longTap(this.state.muted);
      },index*560));
      audioHint.classList.add('playing');
      window.setTimeout(()=>audioHint.classList.remove('playing'),expected.length*560+250);
    });
    audioHint.appendChild(listen);body.appendChild(audioHint);
    const display = document.createElement('div'); display.className = 'gutter-sequence-display';
    const pattern = document.createElement('div'); pattern.className = 'gutter-sequence-pattern';
    display.appendChild(pattern); body.appendChild(display);
    const entered: Array<'short'|'long'> = [];
    const render = () => {
      pattern.innerHTML = '';
      for (let i = 0; i < expected.length; i++) {
        const beat = document.createElement('i');
        beat.className = 'gutter-beat ' + (entered[i] || 'empty');
        beat.textContent = entered[i] ? (entered[i] === 'short' ? '·' : '━') : '—';
        pattern.appendChild(beat);
      }
    };
    render();
    const addBeat = (kind: 'short'|'long') => {
      if (entered.length >= expected.length) entered.length = 0;
      entered.push(kind); render();
      if(kind==='short')simAudio.shortTap(this.state.muted);else simAudio.longTap(this.state.muted);
      if (entered.length === expected.length) {
        if (entered.every((beat, index) => beat === expected[index])) {
          this.state.flags.gutter_puzzle_solved = true;
          this.state.flags.clue_rain_rhythm = true;
          this.state.flags.clue_echo_answered = true;
          this.rememberThought('Водосток: последовательность ударов совпала с ответом рёкана.');
          saveState(this.state);
          simAudio.complete(this.state.muted);
          this.notify('РИТМ СОПОСТАВЛЕН · ПОДСКАЗКА СОХРАНЕНА', 'ok');
          this.openModal(hs);
        } else {
          simAudio.deny(this.state.muted);
          this.notify('Ритм не совпал. Вода сбивается, но подсказку можно прослушать снова.', 'warn');
          entered.length = 0; render();
        }
      }
    };
    const short = document.createElement('button'); short.type = 'button'; short.className = 'inspection-action secondary'; short.textContent = 'КОРОТКИЙ УДАР';
    short.addEventListener('click', () => addBeat('short'));
    const long = document.createElement('button'); long.type = 'button'; long.className = 'inspection-action secondary'; long.textContent = 'ДЛИННЫЙ УДАР';
    long.addEventListener('click', () => addBeat('long'));
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'inspection-action quiet'; reset.textContent = 'СБРОСИТЬ';
    reset.addEventListener('click', () => { entered.length = 0; render(); });
    actions.append(short, long, reset);
    const close = document.createElement('button'); close.type = 'button'; close.className = 'inspection-action quiet'; close.textContent = 'ЗАКРЫТЬ';
    close.addEventListener('click', () => this.closeModal()); actions.appendChild(close);
    if (note) note.textContent = 'Повтори услышанный рисунок. Ошибка не наказывается — можно попробовать снова.';
  }

  private syncAnchorProgress() {
    // A one-use resource leaves a permanent trace; the anchor accepts that trace later.
    if (this.state.flags.took_bell || this.state.flags.used_copper_bell || this.state.flags.anchor_warned || this.state.flags.clue_rain_rhythm) this.state.flags.anchor_step_bell = true;
    if (this.state.flags.used_warding_charm || this.state.flags.anchor_warded || this.state.flags.threaded_note || this.state.flags.clue_shadow_warning || (this.state.flags.took_silk && this.state.flags.took_herbs)) this.state.flags.anchor_step_charm = true;
    if (this.state.flags.used_ember_lantern || this.state.flags.anchor_lit || this.state.flags.world_lantern_lit || this.state.flags.easter_mirror || this.state.flags.note_read || this.state.flags.took_matches) this.state.flags.anchor_step_lantern = true;
    if (this.state.flags.anchor_step_bell && this.state.flags.anchor_step_charm && this.state.flags.anchor_step_lantern) this.state.flags.anchor_puzzle_solved = true;
    saveState(this.state);
  }

  private showAnchorPuzzle(hs: HotspotDef) {
    this.syncAnchorProgress();
    // Once stabilized, the anchor becomes the single, clear sector-exit screen.
    if (this.state.flags.anchor_puzzle_solved) { this.showEndingChoices(); return; }
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const visual = document.getElementById('modalVisual');
    const actions = document.getElementById('modalActions');
    const note = document.getElementById('modalNote');
    if (title) title.textContent = 'ЯКОРЬ RK-01 · ПОСЛЕДОВАТЕЛЬНОСТЬ';
    if (visual) visual.innerHTML = '<div class="ending-core-art anchor-puzzle-art" aria-hidden="true"><i></i><b></b><span></span></div>';
    if (!body || !actions) return;
    body.innerHTML = ''; actions.innerHTML = '';
    const intro = document.createElement('p'); intro.className = 'inspection-description';
    intro.textContent = 'На поверхности три гнезда. На полях записки проступает фраза: «Сначала предупреди. Затем удержи. И только после этого освети». Помести предметы по порядку.';
    body.appendChild(intro);
    const sequence: Array<{ id: ItemId; flag: string; label: string }> = [
      { id: 'copper_bell', flag: 'anchor_step_bell', label: 'I · ПРЕДУПРЕДИТЬ' },
      { id: 'warding_charm', flag: 'anchor_step_charm', label: 'II · УДЕРЖАТЬ' },
      { id: 'ember_lantern', flag: 'anchor_step_lantern', label: 'III · ОСВЕТИТЬ' },
    ];
    const sockets = document.createElement('div'); sockets.className = 'anchor-puzzle-sockets';
    sequence.forEach((step, index) => {
      const done = !!this.state.flags[step.flag];
      const card = document.createElement('div'); card.className = 'anchor-puzzle-socket' + (done ? ' solved' : '');
      const number = document.createElement('b'); number.textContent = String(index + 1).padStart(2, '0');
      const label = document.createElement('strong'); label.textContent = step.label;
      const status = document.createElement('small'); status.textContent = done ? 'СИГНАЛ ПРИНЯТ' : ITEMS[step.id].name;
      card.append(number, label, status); sockets.appendChild(card);
    });
    body.appendChild(sockets);
    const next = sequence.find(step => !this.state.flags[step.flag]);
    const hint = document.createElement('p'); hint.className = this.state.flags.anchor_puzzle_solved ? 'anchor-puzzle-success' : 'anchor-puzzle-hint';
    hint.textContent = next ? 'СЛЕДУЮЩИЙ СИГНАЛ: ' + next.label : 'ВСЕ ТРИ СИГНАЛА ПРИНЯТЫ. ЯКОРЬ СТАБИЛИЗИРОВАН.';
    body.appendChild(hint);
    sequence.forEach(step => {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'inspection-action secondary';
      button.textContent = (this.state.flags[step.flag] ? '✓ ' : '＋ ') + ITEMS[step.id].name;
      const evidenceAvailable = step.flag === 'anchor_step_bell'
        ? !!(this.state.flags.took_bell || this.state.flags.clue_rain_rhythm)
        : step.flag === 'anchor_step_charm'
          ? !!(this.state.flags.threaded_note || this.state.flags.clue_shadow_warning || (this.state.flags.took_silk && this.state.flags.took_herbs))
          : !!(this.state.flags.world_lantern_lit || this.state.flags.easter_mirror || this.state.flags.note_read || this.state.flags.took_matches);
      const hasItem = this.state.inventory.includes(step.id);
      button.disabled = !!this.state.flags[step.flag] || (!hasItem && !evidenceAvailable);
      if (!hasItem && evidenceAvailable) button.textContent = '＋ ПРИНЯТЬ СЛЕД · ' + step.label;
      button.addEventListener('click', () => {
        if (button.disabled) return;
        this.state.flags[step.flag] = true;
        if (hasItem) this.state.flags['used_' + step.id] = true;
        this.syncAnchorProgress();
        saveState(this.state);
        this.showAnchorPuzzle(hs);
      });
      actions.appendChild(button);
    });
    const close = document.createElement('button'); close.type = 'button'; close.className = 'inspection-action quiet'; close.textContent = 'ЗАКРЫТЬ';
    close.addEventListener('click', () => this.closeModal()); actions.appendChild(close);
    if (note) note.textContent = 'Одноразовые вещи не расходуются повторно. Если фонарь, оберег или колокольчик уже применялись, якорь принимает сохранённый след или найденную подсказку.';
    const modal = document.getElementById('simModal');
    if (modal) { modal.hidden = false; modal.classList.add('open'); }
    document.body.classList.add('inspection-open');
  }

  private showEndingChoices() {
    if (!this.state.flags.anchor_puzzle_solved) {
      const anchor = hotspotsFor('storage').find(hs => hs.id === 'hs_anchor');
      if (anchor) this.showAnchorPuzzle(anchor);
      return;
    }
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const visual = document.getElementById('modalVisual');
    const actions = document.getElementById('modalActions');
    const note = document.getElementById('modalNote');
    if (title) title.textContent = 'СЕКТОР RK-01 · ВЫХОД';
    if (visual) visual.innerHTML = '<div class="ending-core-art" aria-hidden="true"><i></i><b></b><span></span></div>';
    if (body) {
      body.innerHTML = '';
      const intro=document.createElement('p');intro.className='inspection-description';
      intro.textContent='Якорь стабилизирован. Осталось подтвердить выход — после этого сектор закроется, а Цефей покажет итоговый отчёт.';
      body.appendChild(intro);
      const status=document.createElement('p');status.className='ending-outcome-copy';
      status.textContent='Перед выходом проверь обязательные следы. Можно уйти и с пропусками, но они повлияют на оценку и состояние канала.';
      body.appendChild(status);
      const checklist=document.createElement('ul');checklist.className='ending-requirements exit-checklist';
      const objectives:[string,string][]=[
        ['Записка прочитана','note_read'],['Дверь генкана открыта','door_unlocked'],
        ['Шёлковая нить найдена','took_silk'],['Колокольчик найден','took_bell'],
        ['Оберег собран','crafted_warding_charm'],['Фонарь восстановлен','crafted_ember_lantern']
      ];
      objectives.forEach(([label,flag])=>{
        const li=document.createElement('li');const done=!!this.state.flags[flag];
        li.className=done?'met':'missing';li.textContent=(done?'✓  ':'—  ')+label;checklist.appendChild(li);
      });
      body.appendChild(checklist);
      const reminder=document.createElement('p');reminder.className='ending-outcome-copy';
      reminder.textContent='После выхода начнётся финальная заставка, затем появится полный отчёт. Вернуться в сектор уже нельзя.';
      body.appendChild(reminder);
    }
    if (actions) {
      actions.innerHTML='';
      const ready=['note_read','door_unlocked','took_silk','took_bell','crafted_warding_charm','crafted_ember_lantern'].every(flag=>!!this.state.flags[flag]);
      const button=document.createElement('button');
      button.type='button';button.className='inspection-action primary ending-good';
      button.textContent='ЗАВЕРШИТЬ СЕКТОР И ПОЛУЧИТЬ ОТЧЁТ';
      button.addEventListener('click',()=>this.chooseEnding(ready?'clear':'break'));
      actions.appendChild(button);
      const back=document.createElement('button');back.type='button';back.className='inspection-action quiet';
      back.textContent='ОСТАТЬСЯ В СЕКТОРЕ';back.addEventListener('click',()=>this.closeModal());actions.appendChild(back);
    }
    if (note) note.textContent='Сначала выход. Отчёт Цефея появится после завершения перехода.';
    const modal = document.getElementById('simModal');
    if (modal) { modal.hidden = false; modal.classList.add('open'); }
    document.body.classList.add('inspection-open');
  }

  private showRunReport() {
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');
    const visual = document.getElementById('modalVisual');
    const actions = document.getElementById('modalActions');
    const note = document.getElementById('modalNote');
    const modal = document.getElementById('simModal');

    const allItems = Object.keys(ITEMS) as ItemId[];
    const collected = allItems.filter(id =>
      this.state.flags['collected_' + id] ||
      this.state.flags['crafted_' + id] ||
      this.state.inventory.includes(id) ||
      this.state.droppedItems.some(x => x.id === id)
    );
    const used = allItems.filter(id => this.state.flags['used_' + id]);
    const clueLabels: Record<string, string> = {
      note_read: 'Записка о суставном скрипе',
      clue_note_gate: 'Записка у водостока',
      clue_note_garden: 'Записка под камнем',
      clue_note_engawa: 'Записка под карнизом',
      clue_note_storage: 'Записка у якоря',
      clue_key_halves: 'Подсказка о половинах ключа',
      threaded_note: 'Записка о шёлковой нити',
      clue_rain_rhythm: 'Ритм дождя',
      clue_shadow_warning: 'Предупреждение о тени',
      clue_echo_answered: 'Ответ эха'
    };
    const easterLabels: Record<string, string> = {
      easter_mirror: 'Отражение из другого времени',
      spider_recognized: 'Дзерогумо узнала тебя',
      spider_story_heard: 'История Дзерогумо',
      spider_thread_given: 'Нить, отданная Дзерогумо',
      heard_steps: 'Шаги над потолком',
      mask_voice_known: 'Голос из маски'
    };
    const clueKeys = Object.keys(clueLabels);
    const secretKeys = Object.keys(easterLabels);
    const clueCount = clueKeys.filter(k => !!this.state.flags[k]).length;
    const secretCount = secretKeys.filter(k => !!this.state.flags[k]).length;
    const score = Math.max(0, Math.min(100, Math.round(
      30 * collected.length / Math.max(1, allItems.length) +
      15 * used.length / Math.max(1, allItems.length) +
      20 * clueCount / Math.max(1, clueKeys.length) +
      15 * secretCount / Math.max(1, secretKeys.length) +
      10 * this.state.visited.length / Math.max(1, LOCATION_ORDER.length) +
      5 * this.state.health / 100 +
      5 * (this.state.ending === 'clear' ? 1 : this.state.ending === 'bind' ? 0.7 : 0.4)
    )));
    const grade = score >= 98 ? 'S' : score >= 92 ? 'A' : score >= 82 ? 'B' : score >= 68 ? 'C' : score >= 52 ? 'D' : score >= 40 ? 'E' : 'F';
    const gradeTier = ({ F: 1, E: 2, D: 3, C: 4, B: 5, A: 6, S: 7 } as Record<string, number>)[grade];
    const gradeArt = ({ F: 'F.png', E: 'Е.png', D: 'D.png', C: 'С.png', B: 'В.png', A: 'А.png', S: 'S.png' } as Record<string, string>)[grade];

    const charmRules = [
      { id: 'charm_1', chance: .32, eligible: this.state.ending === 'clear' || score >= 65 },
      { id: 'charm_2', chance: .34, eligible: !!(this.state.flags.spider_story_heard || this.state.flags.spider_recognized) },
      { id: 'charm_3', chance: .24, eligible: !!this.state.flags.encounter_light },
      { id: 'charm_4', chance: .22, eligible: !!this.state.flags.encounter_sound },
      { id: 'charm_5', chance: .16, eligible: !!this.state.flags.encounter_dweller && secretCount > 0 },
      { id: 'charm_6', chance: .08, eligible: score >= 92 && this.state.ending === 'clear' }
    ];
    const existingArchive = loadCampaignArchive();
    // The run id belongs to this save, not a global pointer that can be left behind
    // after a replay. This prevents a previous run's charm from appearing in a new report.
    const previousRun = this.state.campaignRunId
      ? existingArchive.runs.find(run => run.runId === this.state.campaignRunId) || null
      : null;
    // Each eligible, not-yet-owned charm gets its own independent roll on this run.
    // The exact run record is reused on refresh, so report and dossier always agree.
    const hasRunCharmLedger = existingArchive.runs.length > 0 && existingArchive.runs.every(run => Array.isArray(run.charms));
    const previouslyOwned = new Set(hasRunCharmLedger ? existingArchive.runs.flatMap(run => run.charms || []) : (existingArchive.charms || []));
    const charmDrops = previousRun ? (previousRun.charms || []) : charmRules.filter(rule =>
      rule.eligible && !previouslyOwned.has(rule.id) && Math.random() < rule.chance
    ).map(rule => rule.id);
    const archive = previousRun ? existingArchive : recordCampaignSector('RK-01', {
      score, grade, gradeTier, collected: collected.length, used: used.length,
      clues: clueCount, secrets: secretCount, ending: this.state.ending,
      completedAt: new Date().toISOString(), health: this.state.health, sanity: this.state.sanity,
      visited: this.state.visited.length, items: collected, studiedItems: allItems.filter(id => !!this.state.flags['studied_' + id]), clueNames: clueKeys.filter(k => !!this.state.flags[k]), secretNames: secretKeys.filter(k => !!this.state.flags[k]), encounters: [...(['light','sound','dweller'].filter(k => !!this.state.flags['encounter_' + k])), ...((this.state.flags.spider_seen_0 || this.state.flags.spider_seen_1 || this.state.flags.spider_seen_2 || this.state.flags.spider_seen_3) ? ['spider'] : [])], charms: charmDrops
    });
    if (!previousRun) {
      // Refresh the run pointer whenever a new report is created, even if an old
      // save still carries campaign_recorded=true from a previous session.
      this.state.flags.campaign_recorded = true;
      this.state.campaignRunId = archive.runs[archive.runs.length - 1]?.runId || null;
      localStorage.setItem('limbo_campaign_current_run', this.state.campaignRunId || '');
      saveState(this.state);
    }
    try {
      localStorage.setItem('limbo_pass_RK02', '1');
      localStorage.setItem('limbo_character_card_RK01', JSON.stringify({
        sector: 'RK-01', subject: 'СУБЪЕКТ 01', ending: this.state.ending,
        grade, score, card: 'card' + Math.min(6, gradeTier) + '.png', health: this.state.health,
        sanity: this.state.sanity, visited: this.state.visited.length,
        createdAt: new Date().toISOString()
      }));
      localStorage.setItem('limbo_next_sector_pass', JSON.stringify({
        image: 'b' + archive.passTier + '.png',
        tier: archive.passTier,
        averageScore: archive.averageScore,
        completedSectors: archive.completedSectors,
        totalCollected: archive.totalCollected,
        totalUsed: archive.totalUsed,
        totalClues: archive.totalClues,
        totalSecrets: archive.totalSecrets
      }));
    } catch { /* The current report remains available even if the archive is unavailable. */ }

    if (title) title.textContent = 'ЦЕФЕЙ · ИТОГИ СЕКТОРА RK-01';
    if (visual) {
      visual.innerHTML = '<div class="report-grade-emblem"><img src="/assets/game/items/' + gradeArt + '" alt="Оценка ' + grade + '"><span>ОЦЕНКА · ' + grade + '</span></div>';
    }
    if (body) {
      body.innerHTML = '';
      const intro = document.createElement('p');
      intro.className = 'inspection-description';
      intro.textContent = 'Сектор закрыт. Цефей зафиксировал маршрут, найденные предметы и последствия принятых решений.';
      body.appendChild(intro);

      const rating = document.createElement('section');
      rating.className = 'sector-rating';
      rating.innerHTML = '<span>ОЦЕНКА ПРОХОЖДЕНИЯ</span><strong>' + grade + '</strong><b>' + score + ' / 100</b><small>Находки · применение · подсказки · сюжетные следы</small>';
      body.appendChild(rating);

      const rewards = document.createElement('section');
      rewards.className = 'sector-rewards report-rewards';
      const pass = document.createElement('article');
      pass.className = 'reward-card reward-pass';
      pass.innerHTML = '<img src="/assets/game/items/b' + archive.passTier + '.png" alt="Пропуск следующего сектора"><div><small>ПРОПУСК СЕКТОРА · НАКОПИТЕЛЬНЫЙ</small><strong>ДОСТУП К СЛЕДУЮЩЕМУ СЕКТОРУ</strong><b>УРОВЕНЬ ' + archive.passTier + ' / 3</b><em>Средняя оценка кампании: ' + archive.averageScore + ' · секторов: ' + archive.scoreCount + '</em></div>';
      const card = document.createElement('article');
      card.className = 'reward-card reward-id';
      card.innerHTML = '<img src="/assets/game/items/card' + Math.max(1, Math.min(6, archive.bestCardTier)) + '.png" alt="Карточка персонажа"><div><small>КАРТОЧКА ПЕРСОНАЖА · АРХИВ ЦЕФЕЯ</small><strong>СУБЪЕКТ 01</strong><b>КАРТОЧКА ' + Math.max(1, Math.min(6, archive.bestCardTier)) + ' / 6</b><em>Текущая оценка: ' + grade + ' · лучший ранг сохраняется между секторами</em></div>';
      rewards.append(pass, card);
      if (charmDrops.length) {
        charmDrops.forEach(id => {
          const number = Number(id.replace('charm_', ''));
          const charm = document.createElement('article');
          charm.className = 'reward-card reward-charm';
          charm.innerHTML = '<img src="/assets/game/items/card' + number + '.png" alt="Новый брелок"><div><small>РЕДКАЯ НАХОДКА · БРЕЛОК ПЕРСОНАЖА</small><strong>НОВАЯ ЗАПИСЬ В КОЛЛЕКЦИИ</strong><b>БРЕЛОК ' + String(number).padStart(2,'0') + ' / 06</b><em>Награда выпала случайно и сохранена в личном деле сотрудника.</em></div>';
          rewards.appendChild(charm);
        });
      } else {
        const missed = document.createElement('article');
        missed.className = 'reward-card reward-charm reward-charm-missed';
        missed.innerHTML = '<div><small>КОЛЛЕКЦИОННЫЙ РЕЕСТР</small><strong>БРЕЛОК НЕ ОБНАРУЖЕН</strong><em>В этом прохождении редкая награда не выпала. Условия и шанс изменятся при следующем заходе.</em></div>';
        rewards.appendChild(missed);
      }
      body.appendChild(rewards);

      const cumulative = document.createElement('section');
      cumulative.className = 'campaign-totals';
      cumulative.innerHTML =
        '<div><small>ПРОЙДЕНО СЕКТОРОВ</small><strong>' + archive.scoreCount + '</strong></div>' +
        '<div><small>СРЕДНИЙ БАЛЛ</small><strong>' + archive.averageScore + '</strong></div>' +
        '<div><small>ПРЕДМЕТОВ НАЙДЕНО</small><strong>' + archive.totalCollected + '</strong></div>' +
        '<div><small>ПРЕДМЕТОВ ПРИМЕНЕНО</small><strong>' + archive.totalUsed + '</strong></div>' +
        '<div><small>ПОДСКАЗОК</small><strong>' + archive.totalClues + '</strong></div>' +
        '<div><small>СЮЖЕТНЫХ СЛЕДОВ</small><strong>' + archive.totalSecrets + '</strong></div>';
      body.appendChild(cumulative);

      const details = document.createElement('ul');
      details.className = 'ending-requirements report-details';
      const dangerous = (['black_seed', 'stitched_mask'] as ItemId[]).filter(id =>
        this.state.flags['collected_' + id] || this.state.inventory.includes(id)
      );
      const dangerousUsed = (['black_seed', 'stitched_mask'] as ItemId[]).filter(id => this.state.flags['used_' + id]);
      const encounters = [
        ...(['light', 'sound', 'dweller'].filter(k => this.state.flags['encounter_' + k]).map(k =>
          ({ light: 'Юрэй / онрё', sound: 'Кидзё', dweller: 'Рокудзё-но Миясудокоро' } as Record<string, string>)[k]
        )),
        ...(this.state.flags.spider_seen_0 || this.state.flags.spider_seen_1 || this.state.flags.spider_seen_2 || this.state.flags.spider_seen_3 ? ['Дзерогумо'] : [])
      ];
      const rows: [string, string][] = [
        ['Найдено предметов', String(collected.length)],
        ['Применено предметов', String(used.length)],
        ['Осталось в инвентаре', String(this.state.inventory.length)],
        ['Опасные предметы взяты', dangerous.map(id => ITEMS[id].name).join(', ') || 'нет'],
        ['Опасные предметы применены', dangerousUsed.map(id => ITEMS[id].name).join(', ') || 'нет'],
        ['Встреченные существа', encounters.join(', ') || 'нет'],
        ['Получены ранения', this.state.injuries.length ? this.state.injuries.join(', ') : this.state.flags.combat_hit_taken ? 'да · детали не сохранены' : this.state.flags.combat_dodged ? 'нет · удалось уклониться' : 'не зафиксировано'],
        ['Отступление', this.state.flags.combat_fled ? 'да' : 'нет']
      ];
      rows.forEach(([label, value]) => {
        const li = document.createElement('li');
        li.textContent = label + ': ' + value;
        details.appendChild(li);
      });
      body.appendChild(details);

      const gallery = document.createElement('div');
      gallery.className = 'ending-item-gallery';
      allItems.forEach(id => {
        const found = collected.includes(id);
        const itemCard = document.createElement('div');
        itemCard.className = 'ending-item-card ' + (found ? 'found' : 'missing');
        const img = document.createElement('img');
        img.src = this.itemAsset(id);
        img.alt = '';
        const name = document.createElement('strong');
        name.textContent = ITEMS[id].name;
        const status = document.createElement('small');
        status.textContent = used.includes(id) ? 'ИСПОЛЬЗОВАНО' : found ? (this.state.droppedItems.some(x => x.id === id) ? 'ОСТАВЛЕНО НА ЛОКАЦИИ' : 'НАЙДЕНО') : 'НЕ НАЙДЕНО';
        itemCard.append(img, name, status);
        gallery.appendChild(itemCard);
      });
      body.appendChild(gallery);

      const lore = document.createElement('ul');
      lore.className = 'ending-requirements report-details';
      const groups: Array<[string, Record<string, string>]> = [
        ['ПОДСКАЗКИ', clueLabels],
        ['ПАСХАЛКИ И СЮЖЕТНЫЕ СЛЕДЫ', easterLabels]
      ];
      groups.forEach(([label, labels]) => {
        const keys = Object.keys(labels);
        const foundKeys = keys.filter(k => !!this.state.flags[k]);
        const li = document.createElement('li');
        li.textContent = label + ': ' + (foundKeys.length ? foundKeys.map(k => labels[k]).join(' · ') : 'не обнаружены') + ' (' + foundKeys.length + '/' + keys.length + ')';
        lore.appendChild(li);
      });
      body.appendChild(lore);

      const memoryHeading = document.createElement('h3');
      memoryHeading.className = 'ending-memory-heading';
      memoryHeading.textContent = 'ЗАПОМНЕННЫЕ МЫСЛИ И НАБЛЮДЕНИЯ';
      body.appendChild(memoryHeading);
      const memoryList = document.createElement('ul');
      memoryList.className = 'ending-requirements ending-memory-list';
      (this.state.memories || []).forEach(memory => {
        const li = document.createElement('li');
        li.textContent = memory;
        memoryList.appendChild(li);
      });
      if (!memoryList.children.length) {
        const li = document.createElement('li');
        li.textContent = 'В памяти не осталось отдельных записей.';
        memoryList.appendChild(li);
      }
      body.appendChild(memoryList);

      const outcome = document.createElement('p');
      outcome.className = 'ending-outcome-copy';
      outcome.textContent = this.state.ending === 'clear'
        ? 'Итог: канал очищен. Память сектора сохранена.'
        : this.state.ending === 'bind'
          ? 'Итог: связь закреплена. Маска сохранена как часть канала; голос сектора может отвечать в следующих узлах.'
          : 'Итог: канал разорван. Часть памяти сектора потеряна.';
      body.appendChild(outcome);
    }
    if (actions) {
      actions.innerHTML = '';
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'inspection-action primary ending-good';
      next.textContent = 'ПРОДОЛЖИТЬ · СЛЕДУЮЩАЯ СЦЕНА';
      next.addEventListener('click', () => { window.location.href = '/scene-shanghai.html'; });
      actions.appendChild(next);
      const replay = document.createElement('button');
      replay.type = 'button';
      replay.className = 'inspection-action quiet report-replay';
      replay.textContent = 'ПЕРЕИГРАТЬ СЕКТОР';
      replay.addEventListener('click', () => this.showSystemConfirm('reset'));
      actions.appendChild(replay);
      const exit = document.createElement('button');
      exit.type = 'button';
      exit.className = 'inspection-action quiet';
      exit.textContent = 'ВЫЙТИ ИЗ СИМУЛЯЦИИ';
      exit.addEventListener('click', () => this.showSystemConfirm('exit'));
      actions.appendChild(exit);
    }
    if (note) note.textContent = 'Брелок-пропуск и карточка персонажа сохранены. Повторное прохождение обновит результат RK-01, не стирая архив кампании.';
    if (modal) { modal.hidden = false; modal.classList.add('report-mode', 'open'); modal.style.display = 'flex'; }
    document.body.classList.add('inspection-open', 'sector-finished');
  }

  private chooseEnding(ending: 'clear'|'bind'|'break') {
    if(this.state.completed)return;
    if (!this.state.flags.anchor_puzzle_solved) { this.notify('Выход заблокирован: сначала стабилизируй якорь.', 'warn'); return; }
    this.state.completed = true;
    this.state.ending = ending;
    this.state.flags.pass_RK02 = true;
    this.state.flags.character_card_RK01 = true;
    try {
      localStorage.setItem('limbo_pass_RK02', '1');
      localStorage.setItem('limbo_character_card_RK01', JSON.stringify({sector:'RK-01',subject:'СУБЪЕКТ 01',ending,health:this.state.health,sanity:this.state.sanity,visited:this.state.visited.length,createdAt:new Date().toISOString()}));
    } catch { /* архив недоступен — отчёт всё равно остаётся в сохранении сектора */ }
    // Freeze every active loop before the exit cinematic: no more encounters, sanity drain or ambient threats.
    if (this.eventTimer) clearInterval(this.eventTimer as number);
    if (this.matrixTimer) clearInterval(this.matrixTimer as number);
    if (this.worldClockTimer) clearInterval(this.worldClockTimer as number);
    if (this.hallucinationTimer) clearInterval(this.hallucinationTimer as number);
    if (this.soundUiTimer) clearInterval(this.soundUiTimer as number);
    if (this.threatApproachTimer) clearInterval(this.threatApproachTimer as number);
    if (this.enemyTurnTimer) clearTimeout(this.enemyTurnTimer as number);
    if (this.spiderDialogTimer) clearTimeout(this.spiderDialogTimer as number);
    this.threatActive = false;
    this.spiderInCombat = false;
    document.getElementById('threatOverlay')?.classList.remove('open');
    document.getElementById('combatScreen')?.classList.remove('open');
    document.getElementById('spiderDialogue')?.remove();
    document.getElementById('sceneCreature')?.remove();
    document.body.classList.remove('threat-active','combat-active','threat-kind-light','threat-kind-sound','threat-kind-dweller');
    simAudio.stopAmbient();
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
      { const at = this.state.inventory.indexOf('black_seed'); if (at >= 0) this.state.inventory.splice(at, 1); }
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
      'Переход сорван. По ту сторону что-то закричало — и внезапно замолчало.';
    this.notify('ВЫХОД ИЗ СЕКТОРА · '+copy,'ok');
    this.showSense('◇','Сектор покинут. Данные переданы Цефею.',ending !== 'clear');
    this.stage.classList.add('sector-exit');
    document.body.classList.add('sector-finished');
    document.body.classList.add('sector-exit-active');
    this.showRunReport();
  }

  private closeModal() {
    const modal = document.getElementById('simModal');
    modal?.classList.remove('open', 'report-mode');
    if (modal) { modal.hidden = true; modal.style.removeProperty('display'); }
    document.body.classList.remove('inspection-open');
    document.querySelectorAll('.hotspot.being-inspected').forEach(node => node.classList.remove('being-inspected'));
  }

  private renderInv() {
    this.invEl.innerHTML = '';
    const count = document.getElementById('inventoryCount') || document.getElementById('invCount');
    if (count) count.textContent = this.state.inventory.length + ' / 12';
    const stacks = new Map<ItemId, number>();
    this.state.inventory.forEach(id => stacks.set(id, (stacks.get(id) || 0) + 1));
    for (const [id, quantity] of stacks) {
      const def = ITEMS[id];
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'inv-slot' + (this.state.selected === id ? ' selected' : '');
      slot.innerHTML = `<img class="inventory-item-art" src="${this.itemAsset(id)}" alt="${def.name}" draggable="false"><span class="n">${def.short}</span>${quantity > 1 ? '<b class="inv-stack-count">×' + quantity + '</b>' : ''}`;
      slot.title = def.name + ' · ' + quantity + ' шт. · ЛКМ выбрать · ПКМ осмотр';
      slot.draggable=true;
      slot.addEventListener('dragstart',(e)=>{e.dataTransfer?.setData('text/limbo-item',id);if(e.dataTransfer)e.dataTransfer.effectAllowed='move';});
      slot.addEventListener('click', () => this.onInv(id));
      slot.addEventListener('focus', () => simAudio.hover(this.state.muted));
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();e.stopPropagation();
        if(e.shiftKey)this.dropItem(id);else this.openItemExam(id);
      });
      this.invEl.appendChild(slot);
    }
    for (let i = stacks.size; i < 12; i++) {
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
    const healthFill = (document.getElementById('healthFill') || document.getElementById('hpBar')) as HTMLElement | null;
    const sanityFill = (document.getElementById('sanityFill') || document.getElementById('sanBar')) as HTMLElement | null;
    const healthValue = document.getElementById('healthValue') || document.getElementById('hpText');
    const sanityValue = document.getElementById('sanityValue') || document.getElementById('sanText');
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
    document.getElementById('sceneCreature')?.remove();
    document.body.classList.remove('threat-active', 'threat-kind-light', 'threat-kind-sound', 'threat-kind-dweller');
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
    const selected = this.state.selected && this.state.inventory.includes(this.state.selected)
      ? this.state.selected : null;
    if (selected !== this.state.selected) {
      this.state.selected = selected;
      saveState(this.state);
    }
    const handLabel = document.getElementById('handLabel');
    if (handLabel) handLabel.textContent = selected ? 'В РУКАХ: ' + ITEMS[selected].name : 'В РУКАХ: —';
    const art = document.getElementById('selectedArt');
    const copy = document.getElementById('selectedCopy');
    const useButton = document.getElementById('btnUseItem') as HTMLButtonElement | null;
    const examineButton = document.getElementById('btnExamine') as HTMLButtonElement | null;
    if (!selected) {
      if (art) art.textContent = '—';
      if (copy) copy.innerHTML = '<strong>НИЧЕГО</strong><small>Выберите предмет в инвентаре</small>';
      if (useButton) useButton.disabled = true;
      if (examineButton) examineButton.disabled = true;
      return;
    }
    const def = ITEMS[selected];
    if (art) art.innerHTML = '<img class="item-art-image" src="' + this.itemAsset(selected) + '" alt="' + def.name + '" draggable="false">';
    if (copy) {
      copy.innerHTML = '<strong></strong><span></span><small></small>';
      copy.querySelector('strong')!.textContent = def.name;
      copy.querySelector('span')!.textContent = def.examine;
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
        paper_lantern_shard: 'ПРИМЕНЕНИЕ: соединить с шёлковой нитью или со спичками · расходуется 1 осколок',
        mirror_shard: 'ПРИМЕНЕНИЕ: соединить с шёлковой нитью · расходуется 1 осколок',
        mirror_shard_before_fire: 'ПРИМЕНЕНИЕ: соединить с осколком зеркала после пожара',
        mirror_shard_after_fire: 'ПРИМЕНЕНИЕ: соединить с осколком зеркала до пожара',
        mirror_lens: 'ПРИМЕНЕНИЕ: приложить к потемневшему стеклу в коридоре',
        kokeshi_note: 'ПРИМЕНЕНИЕ: прочитать и сохранить подсказку',
        silk_thread: 'ПРИМЕНЕНИЕ: соединить с подходящим предметом',
      };
      const stackCount = this.state.inventory.filter(item => item === selected).length;
      const recipes = RECIPES.filter(recipe => recipe.a === selected || recipe.b === selected);
      const recipeHints = recipes.map(recipe => {
        const partner = recipe.a === selected ? recipe.b : recipe.a;
        return ITEMS[partner].name + ' → ' + ITEMS[recipe.result].name;
      });
      copy.querySelector('small')!.textContent = (help[selected] || 'ПКМ — осмотреть · выбери объект сцены, чтобы попробовать применить') +
        (stackCount > 1 ? ' · В СТЕКЕ: ' + stackCount + ' · расходуется по 1 шт.' : '') +
        (recipeHints.length ? ' · СОЕДИНИТЬ: ' + recipeHints.join(' / ') : '');
    }
    if (useButton) useButton.disabled = false;
    if (examineButton) examineButton.disabled = false;
  }


  /** The sound meter measures how much noise we make, not speaker volume. */
  private startSoundDynamics() {
    if (this.soundUiTimer) clearInterval(this.soundUiTimer as number);
    const update = () => {
      const now = Date.now();
      const elapsed = this.noiseDuration > 0 ? (now - this.noiseStartedAt) / this.noiseDuration : 1;
      const fadingNoise = now < this.noiseUntil && elapsed < 1 ? this.noisePeak * (1 - Math.max(0, elapsed)) : 0;
      const level = Math.max(this.lightActive ? 18 : 1, fadingNoise);
      this.currentSoundLevel = Math.max(0, Math.min(100, level));
      const meter = document.querySelector<HTMLElement>('.sound-meter');
      const readout = document.querySelector<HTMLElement>('.sound-readout');
      if (meter) {
        meter.style.setProperty('--sound-activity', String(this.currentSoundLevel / 100));
        meter.dataset.level = this.currentSoundLevel >= 68 ? 'high' : this.currentSoundLevel >= 34 ? 'mid' : 'low';
        Array.from(meter.querySelectorAll<HTMLElement>('i')).forEach((bar, index) => {
          // The columns behave like a real playback equalizer: almost flat in silence,
          // increasingly tall and lively as our noise rises. Their profiles stay distinct.
          const shape = [.18,.42,.27,.72,.34,.58,.22,.9,.31,.66,.24,.49][index % 12];
          const amplitude = this.currentSoundLevel / 100;
          const pulse = (Math.sin(now / (210 + index * 13) + index * 1.31) + 1) * .5;
          // Silence is almost a flat baseline. Noise opens each frequency column
          // independently, like a music player spectrum rather than a row of LEDs.
          const floor = 1.5 + shape * 2.2;
          const height = floor + Math.pow(amplitude, .82) * shape * 88 + pulse * amplitude * 13;
          const hue = amplitude < .72
            ? 218 - (amplitude / .72) * 163
            : 55 - ((amplitude - .72) / .28) * 55;
          const lightness = 62 - amplitude * 17;
          bar.style.setProperty('--bar-height', Math.min(100, height).toFixed(1) + '%');
          bar.style.setProperty('--bar-opacity', String(.28 + amplitude * .72));
          bar.style.setProperty('--bar-color', `hsl(${hue.toFixed(0)} 86% ${lightness.toFixed(0)}%)`);
          bar.style.setProperty('--bar-glow', (1 + amplitude * 9).toFixed(1) + 'px');
        });
      }
      if (readout) {
        readout.dataset.level = this.currentSoundLevel >= 68 ? 'high' : this.currentSoundLevel >= 34 ? 'mid' : 'low';
        readout.style.setProperty('--noise-alert', String(this.currentSoundLevel / 100));
      }
      const caption = document.getElementById('soundCaption');
      if (caption && !this.threatActive) {
        caption.textContent = this.currentSoundLevel >= 68 ? 'ШУМ ВЫСОКИЙ · нас легко услышать' :
          this.currentSoundLevel >= 34 ? 'ШУМ СРЕДНИЙ · кто-то может услышать' :
          this.lightActive ? 'ТИХИЙ ГУЛ · горит фонарь' : 'ТИХО · слышен только дождь';
      }
      if (!this.threatActive) {
        this.updateAwareness(this.currentSoundLevel >= 68 ? 1 : 0);
      }
      const dangerFill = document.getElementById('dangerFill') as HTMLElement | null;
      const dangerValue = document.getElementById('dangerValue');
      const dangerReadout = document.querySelector<HTMLElement>('.danger-readout');
      const levelName = this.currentSoundLevel >= 68 ? 'high' : this.currentSoundLevel >= 34 ? 'mid' : 'low';
      if (dangerReadout) { dangerReadout.dataset.level = levelName; dangerReadout.style.setProperty('--danger-heat', String(this.currentSoundLevel / 100)); }
      if (dangerFill) dangerFill.style.width = Math.max(4, this.currentSoundLevel) + '%';
      if (dangerValue) dangerValue.textContent = levelName === 'high' ? 'ВЫСОКАЯ' : levelName === 'mid' ? 'СРЕДНЯЯ' : 'НИЗКАЯ';
    };
    update();
    this.soundUiTimer = window.setInterval(update, 140);
  }

  private makeNoise(message: string) {
    const now = Date.now();
    const carriedLevel = Math.max(this.currentSoundLevel, this.noisePeak * Math.max(0, 1 - (now - this.noiseStartedAt) / Math.max(1, this.noiseDuration)));
    this.noiseStartedAt = now;
    this.noiseDuration = 16000;
    this.noisePeak = Math.min(100, carriedLevel + 34);
    this.noiseUntil = now + this.noiseDuration;
    this.noiseEncounterPending = true;
    this.noiseEncounterExpiresAt = this.noiseUntil;
    const caption = document.getElementById('soundCaption');
    if (caption) caption.textContent = 'ШУМ · источник — ты';
    const danger = document.getElementById('dangerValue');
    if (danger) danger.textContent = 'ПОВЫШЕНА';
    const fill = document.getElementById('dangerFill') as HTMLElement | null;
    if (fill) fill.style.width = '72%';
    this.showSense('◖))', message, true);
    simAudio.steps(this.state.muted);
    simAudio.click(this.state.muted);
  }

  private showCreatureInScene() {
    document.getElementById('sceneCreature')?.remove();
    const el = document.createElement('div');
    el.id = 'sceneCreature';
    el.className = 'scene-creature scene-creature-' + this.threatKind;
    const creatureLine = this.threatKind === 'light'
      ? '«Не гаси свет. Я почти вспомнил твоё лицо».'
      : this.threatKind === 'sound'
        ? '«Тише. Я слышу, как ты думаешь».'
        : '«Под полом осталось место. Для ещё одного».';
    el.innerHTML = `<img class="creature-sprite" src="/assets/game/creatures/${this.threatKind === 'light' ? 'blind' : this.threatKind === 'sound' ? 'listener' : 'lodger'}.png" alt=""><span class="creature-dialogue">${creatureLine}</span>`;
    el.setAttribute('aria-label', this.threatKind === 'light' ? 'Юрэй / онрё' : this.threatKind === 'sound' ? 'Кидзё' : 'Рокудзё');
    this.stage.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
  }

  private startCombat() {
    if (document.body.classList.contains('combat-active')) return;
    if (this.threatApproachTimer) clearInterval(this.threatApproachTimer as number);
    this.threatApproachTimer = 0;
    this.threatActive = false;
    document.getElementById('sceneCreature')?.remove();
    document.getElementById('spiderPresence')?.remove();
    document.getElementById('spiderDialogue')?.remove();
    document.getElementById('threatOverlay')?.classList.remove('open');
    document.getElementById('threatOverlay')?.setAttribute('aria-hidden','true');
    if (this.enemyTurnTimer) clearTimeout(this.enemyTurnTimer as number);
    this.dodgeReady = false; this.guarding = false; this.initiative = 100; this.enemyArmsWeakened = false; this.enemyLegsSlowed = false;
    this.monsterMaxHp = this.spiderInCombat ? 62 : this.threatKind === 'light' ? 42 : this.threatKind === 'sound' ? 34 : 54;
    this.monsterHp = this.monsterMaxHp;
    this.monsterName = this.spiderInCombat ? 'ДЗЕРОГУМО' : this.threatKind === 'light' ? 'ЮРЭЙ · ОНРЁ' : this.threatKind === 'sound' ? 'КИДЗЁ' : 'РОКУДЗЁ-НО МИЯСУДОКОРО';
    this.combatTurn = 0; this.combatTarget = 'torso';
    this.state.flags['encounter_' + this.threatKind] = true;
    this.state.flags['encounter_' + this.threatKind + '_yokai'] = true;
    const locationLabel = document.getElementById('combatLocationLabel');
    const locationSub = document.getElementById('combatLocationSub');
    const zoneLabel = document.getElementById('zoneLabel')?.textContent?.trim();
    const zoneSub = document.getElementById('zoneSub')?.textContent?.trim();
    if (locationLabel && zoneLabel) locationLabel.textContent = zoneLabel;
    if (locationSub && zoneSub) locationSub.textContent = zoneSub;
    const name = document.getElementById('combatMonsterName'); if (name) name.textContent = this.monsterName;
    const sprite = document.getElementById('combatMonsterSprite') as HTMLImageElement | null;
    if (sprite) sprite.src = this.spiderInCombat ? '/assets/game/creatures/spider4.png' : '/assets/game/creatures/' + (this.threatKind === 'light' ? 'blind' : this.threatKind === 'sound' ? 'listener' : 'lodger') + '.png';
    const art = document.getElementById('combatMonsterArt');
    art?.classList.remove('combat-beast-light','combat-beast-sound','combat-beast-dweller');
    art?.classList.add('combat-beast-' + this.threatKind);
    const screen = document.getElementById('combatScreen');
    if (screen) { screen.hidden = false; screen.classList.add('open'); screen.setAttribute('aria-hidden','false'); }
    const dodge = document.getElementById('combatDodge') as HTMLButtonElement | null; if (dodge) dodge.disabled = true;
    document.body.classList.add('combat-active');
    this.renderCombatWounds();
    this.renderCombatInventory();
    const creatureVoice: Record<string,string> = {
      spider: 'Дзерогумо шепчет: «Ты всё-таки пришёл. Я оставила тебе место между нитями».',
      light: 'Юрэй шепчет из-под повязки: «Свет… ты принёс мне глаза. Отдай их обратно».',
      sound: 'Кидзё отвечает твоим голосом: «Не зови. Я уже запомнила, как ты звучишь».',
      dweller: 'Рокудзё шепчет из складок кимоно: «Под досками ещё кто-то. Он считает шаги вместо нас».',
    };
    this.updateCombatHud(this.spiderInCombat ? creatureVoice.spider : creatureVoice[this.threatKind]);
    this.state.flags['heard_' + this.threatKind] = true;
    saveState(this.state);
    this.beginEnemyAttack();
    this.makeNoise('Схватка началась. Шум разбудит всё вокруг.');
    if (this.spiderInCombat) simAudio.monsterDweller(this.state.muted);
    else if (this.threatKind === 'light') simAudio.monsterBlind(this.state.muted);
    else if (this.threatKind === 'sound') simAudio.monsterListener(this.state.muted);
    else simAudio.monsterDweller(this.state.muted);
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
    this.renderCombatInventory();
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

  private combatItemInfo(id: ItemId): { usable: boolean; reason: string } {
    const wounded = this.state.health < 100 || this.state.injuries.includes('bleed');
    switch (id) {
      case 'herbal_poultice':
        return wounded
          ? { usable: true, reason: '+22 здоровья и остановка кровотечения. Расходуется.' }
          : { usable: false, reason: 'Пока не нужна: здоровье полное, кровотечения нет.' };
      case 'medicinal_herbs':
        return this.state.injuries.includes('bleed') || this.state.health <= 78
          ? { usable: true, reason: 'Перевязать рану: +12 здоровья, остановить кровотечение. Расходуется.' }
          : { usable: false, reason: 'Нужны ранения или потеря здоровья.' };
      case 'warding_charm':
        return this.state.sanity < 100
          ? { usable: true, reason: '+16 рассудка. Одноразовый оберег.' }
          : { usable: false, reason: 'Рассудок стабилен — оберег пока не сработает.' };
      case 'matchbox':
        return { usable: true, reason: 'Вспышка отвлечёт существо, даст время и нанесёт небольшой урон.' };
      case 'ember_lantern':
        return this.threatKind !== 'light'
          ? { usable: true, reason: 'Огонь обожжёт существо и вернёт инициативу.' }
          : { usable: false, reason: 'Юрэй идёт на свет. Фонарь только ускорит его атаку.' };
      case 'stitched_mask':
        return { usable: true, reason: 'Чужой голос маски заставит существо отшатнуться, но отнимет 6 рассудка.' };
      case 'copper_bell':
        return this.threatKind === 'sound' || this.threatKind === 'dweller'
          ? { usable: true, reason: 'Собьёт ритм атаки и замедлит существо.' }
          : { usable: false, reason: 'Юрэй реагирует на звук слишком резко. Звонок опасен.' };
      default:
        return { usable: false, reason: 'В этой схватке предмет не поможет. Сохрани его для исследования.' };
    }
  }

  private renderCombatInventory() {
    const host = document.getElementById('combatInventoryItems');
    const hint = document.getElementById('combatItemHint');
    if (!host) return;
    host.innerHTML = '';
    if (!this.state.inventory.length) {
      const empty = document.createElement('p');
      empty.className = 'combat-inventory-empty';
      empty.textContent = 'В карманах пусто. Придётся полагаться на себя.';
      host.appendChild(empty);
    }
    const stacks = new Map<ItemId, number>();
    this.state.inventory.forEach(id => stacks.set(id, (stacks.get(id) || 0) + 1));
    for (const [id, quantity] of stacks) {
      const def = ITEMS[id];
      const info = this.combatItemInfo(id);
      const selected = this.state.selected === id;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'combat-item-card' + (info.usable ? ' is-usable' : ' is-unusable') + (selected ? ' is-selected' : '');
      card.disabled = !info.usable || this.dodgeReady;
      card.style.setProperty('--item-tint', def.color);
      card.setAttribute('aria-label', def.name + '. ' + info.reason);
      card.innerHTML = '<img src="' + this.itemAsset(id) + '" alt="" draggable="false"><strong></strong><small></small>' + (quantity > 1 ? '<b class="combat-stack-count">×' + quantity + '</b>' : '');
      card.querySelector('strong')!.textContent = def.short;
      card.querySelector('small')!.textContent = info.usable ? 'ДОСТУПЕН' : 'НЕ ПОДХОДИТ';
      card.title = def.name + ' — ' + info.reason;
      if (info.usable) {
        card.addEventListener('click', () => {
          this.state.selected = id;
          saveState(this.state);
          this.renderInv();
          this.renderCombatInventory();
          simAudio.click(this.state.muted);
          this.combatAction('item');
        });
      }
      host.appendChild(card);
    }
    if (hint) {
      if (this.state.selected) {
        const info = this.combatItemInfo(this.state.selected);
        hint.textContent = ITEMS[this.state.selected].name + ' · ' + info.reason;
      } else {
        hint.textContent = 'Выбери подсвеченный предмет. Серые предметы сейчас бесполезны.';
      }
    }
  }

  private combatAction(action: 'attack'|'guard'|'item'|'noise'|'flee') {
    if (!document.getElementById('combatScreen')?.classList.contains('open') || this.dodgeReady) return;
    let log = '';
    if (action === 'flee') { this.state.flags.combat_fled = true; this.state.health = Math.max(0, this.state.health - 5); saveState(this.state); this.finishCombat('Ты отступил, получив ранение.'); return; }
    if (action === 'attack') {
      const weaponDamage: Partial<Record<ItemId, number>> = { ryokan_key:7, wet_key_half:5, wet_key_other:5, ember_lantern:8, copper_bell:4, paper_lantern_shard:13, medicinal_herbs:2, stitched_mask:3 };
      const base = this.state.selected ? (weaponDamage[this.state.selected] ?? 10) : 8 + Math.floor(Math.random()*4);
      if (this.state.selected && weaponDamage[this.state.selected] !== undefined) this.state.flags['used_' + this.state.selected] = true;
      const armPenalty = this.state.injuries.includes('arm') ? 4 : 0;
      const accuracy: Record<string,number> = {head:.62,torso:.92,arms:.82,legs:.8};
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
      const availability = this.combatItemInfo(id);
      if (!availability.usable) { this.updateCombatHud(availability.reason); return; }
      if (id === 'herbal_poultice') {
        this.state.health = Math.min(100, this.state.health + 22);
        this.state.injuries = this.state.injuries.filter(x => x !== 'bleed');
        log = 'Ты затянул рану повязкой. +22 HP · кровотечение остановлено.';
      } else if (id === 'medicinal_herbs') {
        this.state.health = Math.min(100, this.state.health + 12);
        this.state.injuries = this.state.injuries.filter(x => x !== 'bleed');
        log = 'Ты растёр горькие листья и прижал к ране. +12 HP · кровотечение остановлено.';
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
        log = this.threatKind === 'light' ? 'Юрэй не боится света. Он бросается ближе.' : 'Пламя обжигает тварь. +18 инициативы.';
      } else if (id === 'copper_bell') {
        this.enemyLegsSlowed = true;
        this.initiative = Math.min(100, this.initiative + 24);
        log = 'Глухой звон сбивает существо с ритма. +24 инициативы · атака замедлена.';
      } else if (id === 'stitched_mask') {
        this.state.sanity = Math.max(0, this.state.sanity - 6);
        this.monsterHp = Math.max(0, this.monsterHp - 12);
        log = 'Маска отвечает чужим голосом. Существо отшатывается, но рассудок -6.';
      } else {
        this.updateCombatHud('Этот предмет нельзя безопасно использовать в бою. Попробуй другой.'); return;
      }
      this.state.flags['used_' + id] = true;
      if (['herbal_poultice','medicinal_herbs','warding_charm','matchbox'].includes(id)) { const at=this.state.inventory.indexOf(id); if(at>=0)this.state.inventory.splice(at,1); }
      this.state.selected = null;
      this.renderInv(); this.renderVitals(); this.renderCombatInventory();
    } else { this.makeNoise('Резкий хлопок отвлёк существо. Но шум услышали в соседних комнатах.'); this.monsterHp=Math.max(0,this.monsterHp-6); log='Резкий хлопок отвлёк существо. Но шум услышали в соседних комнатах.'; simAudio.impact(this.state.muted); }
    if (this.monsterHp<=0) { this.finishCombat('Существо рухнуло во тьму. Победа.'); return; }
    this.combatTurn++; this.initiative=Math.max(0,this.initiative-22);
    if (this.state.injuries.includes('bleed')) { this.state.health=Math.max(0,this.state.health-2); log+=' Кровь продолжает уходить: -2 HP.'; }
    this.renderVitals(); this.renderCombatWounds();
    const creatureWhispers: Record<string,string[]> = {
      spider: ['«Я не ловлю тебя. Я держу то, что падает».','«Под домом есть комната из имён».','«Не ищи выход там, где я смотрю».'],
      light: ['«Не гаси его. В темноте я вижу лучше».','«Третий удар был не колоколом».'],
      sound: ['«Твои шаги повторяются. Значит, нас уже двое».','«М. тоже пытался молчать».'],
      dweller: ['«Ключ открывает дверь. Но не ту, которую ты ищешь».','«Семя помнит того, кто первым его проглотил».'],
    };
    const whispers = this.spiderInCombat ? creatureWhispers.spider : creatureWhispers[this.threatKind];
    this.updateCombatHud(log + ' ' + this.enemyAttackDescription() + ' ' + whispers[this.combatTurn % whispers.length]);
    this.beginEnemyAttack(); saveState(this.state);
  }

  private enemyAttackDescription() {
    if (this.spiderInCombat) return 'Дзерогумо поднимает руки. Между пальцами натягиваются нити.';
    if (this.threatKind==='light') return 'Юрэй собирается выплыть из тумана.';
    if (this.threatKind==='sound') return 'Кидзё накапливает звуковую волну.';
    return 'Рокудзё тянется к тебе из складок кимоно.';
  }

  private beginEnemyAttack() {
    this.dodgeReady=true;
    const dodge=document.getElementById('combatDodge') as HTMLButtonElement|null;
    if(dodge){dodge.disabled=false;dodge.classList.add('dodge-window');}
    const phase=document.getElementById('combatPhase'); if(phase) phase.textContent=this.threatKind==='light'?'ПРЫЖОК · УКЛОНИСЬ':this.threatKind==='sound'?'ЗВУКОВОЙ ИМПУЛЬС · ЗАЩИТИСЬ':'ЗАХВАТ · УКЛОНИСЬ';
    const art=document.getElementById('combatMonsterArt'); art?.classList.remove('attack'); void art?.clientWidth; art?.classList.add('attack');
    const windowMs=this.spiderInCombat
      ? Math.max(620, 1600 - this.spiderAngerLevel() * 230)
      : this.state.injuries.includes('leg')?900:this.enemyLegsSlowed?1900:this.threatKind==='light'?1450:this.threatKind==='sound'?1750:1600;
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
    const perfect = progress >= .48 && progress <= .94;
    this.resolveEnemyAttack(perfect, perfect ? 'perfect' : progress < .62 ? 'early' : 'late');
  }

  private resolveEnemyAttack(evaded:boolean, timing: 'perfect'|'early'|'late' = 'late') {
    if(!this.dodgeReady)return;
    this.dodgeReady=false;
    const dodge=document.getElementById('combatDodge') as HTMLButtonElement|null;
    if(dodge){dodge.disabled=true;dodge.classList.remove('dodge-window');}
    const art=document.getElementById('combatMonsterArt'); art?.classList.remove('attack');
    let incoming=this.spiderInCombat?10:this.threatKind==='dweller'?12:this.threatKind==='light'?11:8;
    if (this.enemyArmsWeakened) incoming = Math.ceil(incoming * .55);
    let wound='';
    if(this.threatKind==='light'&&!evaded) wound='leg';
    if(this.threatKind==='sound'&&!evaded){this.state.sanity=Math.max(0,this.state.sanity-9);wound='arm';}
    if(this.threatKind==='dweller'&&!evaded) wound='bleed';
    if(this.spiderInCombat&&!evaded) wound='arm';
    const damage=evaded?0:this.guarding?Math.ceil(incoming*.28):timing === 'early' ? Math.ceil(incoming * .55) : timing === 'late' ? Math.ceil(incoming * .8) : incoming;
    this.guarding=false; this.enemyArmsWeakened=false; this.enemyLegsSlowed=false;
    if(!evaded){
      this.state.health=Math.max(0,this.state.health-damage);
      if(wound&&!this.state.injuries.includes(wound)){this.state.injuries.push(wound);}
      simAudio.impact(this.state.muted);
      document.body.classList.remove('player-hit');void document.body.clientWidth;document.body.classList.add('player-hit');setTimeout(()=>document.body.classList.remove('player-hit'),360);
    }else{simAudio.evade(this.state.muted);art?.classList.add('miss');setTimeout(()=>art?.classList.remove('miss'),380);this.initiative=Math.min(100,this.initiative+18);}
    this.renderVitals();this.renderCombatWounds();
    if (evaded) this.state.flags.combat_dodged = true;
    else this.state.flags.combat_hit_taken = true;
    const detail=evaded?'ИДЕАЛЬНОЕ УКЛОНЕНИЕ · ты ушёл с линии атаки. Инициатива возвращается.':(timing === 'early' ? 'РАННЕЕ УКЛОНЕНИЕ · ' : 'НЕУДАЧНЫЙ РЫВОК · ')+'Удар достиг цели: -'+damage+' HP.'+(wound?' Получено состояние: '+wound+'.':'');
    this.updateCombatHud(detail);
    saveState(this.state);
    if(this.state.health<=0)this.finishCombat('Ты падаешь. Сознание гаснет…');
  }

  private applySanityTier(sanity: number) {
    const tier = sanity >= 65 ? 0 : sanity >= 45 ? 1 : sanity >= 25 ? 2 : 3;
    document.documentElement.style.setProperty('--sanity-loss', String(1 - sanity / 100));
    const red = Math.max(0, Math.min(1, (65 - sanity) / 65));
    document.body.style.setProperty('--sanity-red', String(red));
    document.body.style.setProperty('--mind-red', `rgba(232, 43, 66, ${Math.pow(red, 1.12) * .78})`);
    if (tier === this.sanityTier) return;
    this.sanityTier = tier;
    document.body.dataset.sanity = String(tier);
    const crt = document.getElementById('crtInterference');
    if (crt) crt.dataset.level = String(tier);
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
    if (tier >= 3) { simAudio.maskWhisper(this.state.muted, 1.5); this.showFalseSilhouette(); this.mirrorInventory(); }
  }

  private triggerImageDistortion(tier: number) {
    document.body.classList.remove('hallucination-hit');
    void document.body.offsetWidth;
    document.body.classList.add('hallucination-hit');
    window.setTimeout(() => document.body.classList.remove('hallucination-hit'), tier >= 3 ? 1500 : 850);
  }

  private spawnMovingShadow() {
    if (document.body.classList.contains('combat-active') || this.threatActive) return;
    const shadow = document.createElement('img');
    shadow.className = 'sanity-shadow';
    shadow.src = '/assets/game/creatures/spider1.png';
    shadow.alt = '';
    shadow.draggable = false;
    shadow.setAttribute('aria-hidden','true');
    shadow.style.setProperty('--shadow-y', (12 + Math.random()*66) + '%');
    shadow.style.setProperty('--shadow-x', (8 + Math.random()*82) + '%');
    this.stage.appendChild(shadow);
    window.setTimeout(() => shadow.remove(), 4200);
  }

  private showFalseSilhouette() {
    if (document.getElementById('falsePresence')) return;
    const ghost = document.createElement('img');
    ghost.id = 'falsePresence';
    ghost.className = 'false-presence';
    ghost.src = '/assets/game/creatures/spider0.png';
    ghost.alt = '';
    ghost.draggable = false;
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
    // Shuffle only rendered DOM slots for a moment; saved inventory data stays intact.
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
    const baseDuration = this.threatKind === 'light' ? 9500 : this.threatKind === 'sound' ? 8000 : 7200;
    // Noise gives the creature a precise trail: at maximum noise it closes in
    // considerably faster, while silence preserves the original suspense window.
    const duration = Math.max(2600, Math.round(baseDuration * (1 - (this.currentSoundLevel / 100) * .62)));
    const dialogueLines: Record<string,string[]> = {
      light: ['«Не гаси свет. Я почти вспомнил твоё лицо».','«Ты несёшь маленькое солнце. Оно пахнет страхом».','«Остановись. Я хочу посмотреть на тебя».'],
      sound: ['«Тише. Я слышу, как ты думаешь».','«Ты повторил этот вдох. В прошлый раз он был последним».','«Не оборачивайся. Я уже стою за твоим голосом».'],
      dweller: ['«Под полом осталось место. Для ещё одного».','«Я помню, как строили эту комнату. Нас не спрашивали».','«Не стой на досках. Они помнят вес».'],
    };
    let lastDialogue = -1;
    const tick = () => {
      if (!this.threatActive) return;
      const progress = Math.min(1, (Date.now()-this.threatStartedAt)/duration);
      const fill = document.getElementById('threatApproachFill') as HTMLElement|null;
      const time = document.getElementById('threatApproachTime');
      if (fill) fill.style.width = (progress*100)+'%';
      if (time) time.textContent = Math.max(0,(duration-(Date.now()-this.threatStartedAt))/1000).toFixed(1);
      const lineIndex = Math.min(2, Math.floor(progress * 3));
      if (lineIndex !== lastDialogue) {
        lastDialogue = lineIndex;
        const dialogue = document.querySelector<HTMLElement>('#sceneCreature .creature-dialogue');
        if (dialogue) {
          dialogue.textContent = dialogueLines[this.threatKind][lineIndex];
          dialogue.classList.remove('dialogue-arrive');
          void dialogue.offsetWidth;
          dialogue.classList.add('dialogue-arrive');
        }
      }
      const creature = document.getElementById('sceneCreature');
      if (creature) {
        creature.style.setProperty('--approach', String(progress));
        creature.classList.toggle('closing-in', progress > .35);
      }
      panel.style.setProperty('--threat-progress', String(progress));
      if (progress >= 1) {
        clearInterval(this.threatApproachTimer as number);
        this.threatApproachTimer = 0;
        this.showSense('◉','Оно уже слишком близко.',true);
        if (this.threatKind === 'light') simAudio.monsterBlind(this.state.muted);
        else if (this.threatKind === 'sound') simAudio.monsterListener(this.state.muted);
        else simAudio.monsterDweller(this.state.muted);
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
      // Recurring hallucinations: visual/audio-only, never alter the saved item state.
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
      this.rememberThought(line);
      const voice = document.getElementById('innerVoice');
      if (voice) voice.textContent = line;
      simAudio.innerVoice(this.state.muted, tier === 3 ? 1.8 : tier === 2 ? 1.2 : .7);
      this.showSense('◉', line, true);
      if (tier >= 2 && Math.random() < (tier === 2 ? .42 : .72)) {
        document.body.classList.remove('hallucination-hit');
        void document.body.clientWidth;
        document.body.classList.add('hallucination-hit');
        setTimeout(() => document.body.classList.remove('hallucination-hit'), 900);
      }
      if (tier >= 2 && Math.random() < (tier === 2 ? .34 : .62)) {
        const caption = document.getElementById('soundCaption');
        if (caption) caption.textContent = tier === 3 ? 'ЧУЖОЙ ГОЛОС · прямо за спиной' : 'ШЁПОТ · неразборчиво';
        simAudio.maskWhisper(this.state.muted, tier === 3 ? 1.7 : 1.15);
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
    }, 12500);
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
    if (this.spiderInCombat && this.monsterHp <= 0) this.state.flags.spider_defeated = true;
    else if (this.spiderInCombat) { this.spiderStage = 3; this.spiderNextAt = Date.now()+38000; }
    this.spiderInCombat = false;
    if (this.enemyTurnTimer) clearTimeout(this.enemyTurnTimer as number);
    this.dodgeReady = false;
    const combatScreen = document.getElementById('combatScreen');
    combatScreen?.classList.remove('open');
    if (combatScreen) { combatScreen.hidden = true; combatScreen.setAttribute('aria-hidden','true'); }
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
    if (id === 'stitched_mask') { this.maskWorn = !this.maskWorn; document.body.classList.toggle('mask-worn', this.maskWorn); this.state.maskWorn = this.maskWorn; this.state.maskExposure = Math.max(0,this.state.maskExposure || 0); this.maskLastTick = Date.now(); this.state.sanity = Math.max(0, Math.min(100, this.state.sanity + (this.maskWorn ? -7 : 2))); saveState(this.state); this.notify(this.maskWorn ? 'Ты надел маску. Юрэй хуже различает твой силуэт, но маска начинает запоминать тебя.' : 'Ты снял маску. Шёпот стих, но на внутренней стороне проступило твоё имя.', this.maskWorn ? 'warn' : 'ok'); this.showSense('◉', this.maskWorn ? 'Маска надета · воздействие нарастает' : 'Маска снята · влияние ослабевает', this.maskWorn); simAudio.maskWhisper(this.state.muted, this.maskWorn ? 1.2 : .5); this.makeNoise('Ткань и бумага шуршат у лица.'); this.renderVitals(); return; }
    if (id === 'ember_lantern') { this.lightActive = !this.lightActive; this.noiseStartedAt = Date.now(); this.noiseDuration = 7000; this.noisePeak = this.lightActive ? 38 : 4; this.noiseUntil = this.noiseStartedAt + this.noiseDuration; this.notify(this.lightActive ? 'Фонарь зажжён. Свет виден издалека.' : 'Ты погасил фонарь.', this.lightActive ? 'warn' : 'ok'); this.showSense('☼', this.lightActive ? 'Источник света активен' : 'Свет погашен', this.lightActive); simAudio.click(this.state.muted); return; }
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
    this.state.flags['used_' + id] = true;
    { const at=this.state.inventory.indexOf(id); if(at>=0)this.state.inventory.splice(at,1); }
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
        this.state.flags['used_' + recipe.a] = true;
        this.state.flags['used_' + recipe.b] = true;
        const a=this.state.inventory.indexOf(recipe.a);
        const b=this.state.inventory.indexOf(recipe.b);
        if (a < 0 || b < 0) {
          this.notify('Для соединения нужен хотя бы один экземпляр каждого предмета.', 'warn');
          this.state.selected = null; this.renderInv(); return;
        }
        this.state.inventory.splice(Math.max(a,b),1);
        this.state.inventory.splice(Math.min(a,b),1);
        this.state.inventory.push(recipe.result);
        this.state.flags['crafted_' + recipe.result] = true;
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
    if (id === 'kokeshi_note') {
      const read = document.createElement('button');
      read.type = 'button';
      read.className = 'inspection-action secondary note-read-action';
      read.textContent = 'ПРОЧИТАТЬ';
      read.onclick = () => {
        examBody.textContent = 'ЛИЧНАЯ ЗАПИСЬ · М.\\n\\nНе верь шагам, которые повторяют твои: это не эхо, оно учится. Первая половина ключа — у чёрной воды, вторая — под доской с тремя царапинами. Нить удержит бумагу, а колокольчик предупредит того, кто слушает.\\n\\nМ. · Не отвечай, если маска заговорит твоим голосом.';
        this.state.flags.note_read = true;
        this.state.flags.clue_key_halves = true;
        this.rememberThought('Записка М.: первый ключ — там, где вода не отражает небо; второй — под доской с тремя царапинами. Нить удерживает бумагу, бумага помнит огонь.');
        saveState(this.state);
        read.textContent = 'ПЕРЕЧИТАТЬ';
        simAudio.whisper(this.state.muted);
      };
      actions.appendChild(read);
    }
    const close = document.createElement('button');
    close.className = 'btn';
    close.textContent = 'ЗАКРЫТЬ';
    close.onclick = () => this.closeModal();
    actions.appendChild(close);
    modal.hidden = false;
    modal.classList.remove('report-mode');
    modal.style.removeProperty('display');
    modal.classList.add('open');
    document.body.classList.add('inspection-open');
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
