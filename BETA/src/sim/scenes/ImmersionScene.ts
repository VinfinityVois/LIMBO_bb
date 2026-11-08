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
  private soundUiTimer: ReturnType<typeof setInterval> | number = 0;
  private noiseStartedAt = 0;
  private noiseDuration = 0;
  private noisePeak = 0;
  private currentSoundLevel = 3;
  private notificationQueue: Array<{ message: string; kind: 'info' | 'warn' | 'ok' }> = [];
  private notificationBusy = false;
  private lastNotification = '';
  private lastNotificationAt = 0;
  private spiderStage = 0;
  private spiderNextAt = Date.now() + 28000;
  private spiderDialogTimer: ReturnType<typeof setTimeout> | number = 0;
  private spiderInCombat = false;

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
    window.addEventListener('resize', () => this.resize());
  }

  async start() {
    this.bindChrome();
    this.ensurePerceptionOverlay();
    if (sessionStorage.getItem('limbo-sector-reboot') === '1') {
      sessionStorage.removeItem('limbo-sector-reboot');
      document.body.classList.add('system-reboot');
    }
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
    this.startSoundDynamics();
    simAudio.startAtmosphere(this.state.muted, LOCATIONS[this.state.location].ambient);
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
      const log = document.getElementById('diveLog');
      if (log) log.innerHTML = '';
      const reboot = document.body.classList.contains('system-reboot');
      overlay.dataset.mode = reboot ? 'reboot' : 'initial';
      const title = overlay.querySelector<HTMLElement>('.dive-title');
      if (title) title.textContent = reboot ? 'ПЕРЕЗАПУСК СЕКТОРА' : 'ПОГРУЖЕНИЕ';
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

  private resize() {
    const r = this.stage.getBoundingClientRect();
    this.parallax.resize(r.width, r.height);
  }

  private showSystemConfirm(mode: 'exit' | 'reset') {
    document.getElementById('systemConfirm')?.remove();
    const isExit = mode === 'exit';
    const overlay = document.createElement('section');
    overlay.id = 'systemConfirm';
    overlay.className = 'system-confirm';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="system-confirm-panel">
        <div class="system-confirm-kicker">ЦЕФЕЙ · СИСТЕМНОЕ ПОДТВЕРЖДЕНИЕ</div>
        <h2>${isExit ? 'ЗАВЕРШИТЬ СЕАНС?' : 'ПЕРЕЗАПУСТИТЬ СЕКТОР?'}</h2>
        <p>${isExit ? 'Текущий прогресс сохранится. Вернуться к досье и покинуть симуляцию?' : 'Текущий проход будет стёрт. Сектор запустится заново с полной последовательностью загрузки.'}</p>
        <div class="system-confirm-actions">
          <button type="button" data-confirm-cancel>ОСТАТЬСЯ</button>
          <button type="button" class="danger" data-confirm-accept>${isExit ? 'ВЫЙТИ ИЗ СИМУЛЯЦИИ' : 'ПЕРЕЗАПУСК'}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    overlay.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
    overlay.querySelector('[data-confirm-accept]')?.addEventListener('click', () => {
      if (isExit) {
        overlay.classList.add('leaving');
        window.setTimeout(() => { window.location.href = '/scene-ryokan.html'; }, 320);
      } else {
        overlay.classList.add('rebooting');
        document.body.classList.add('system-reboot');
        sessionStorage.setItem('limbo-sector-reboot', '1');
        const panel = overlay.querySelector('.system-confirm-panel');
        if (panel) panel.innerHTML = '<div class="system-confirm-kicker">ЦЕФЕЙ · ПЕРЕЗАПУСК</div><h2>СЕАНС ЗАВЕРШАЕТСЯ</h2><p>Стираем состояние текущего прохода и восстанавливаем сектор. Подключение будет установлено заново.</p><div class="system-reboot-progress"><i></i></div>';
        window.setTimeout(() => { resetSim(); window.location.reload(); }, 720);
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
    document.getElementById('btnExit')?.addEventListener('click', () => this.showSystemConfirm('exit'));
    document.getElementById('btnReset')?.addEventListener('click', () => this.showSystemConfirm('reset'));
    document.getElementById('btnInspectItem')?.addEventListener('click', () => {
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
    // Keep audio unlocked after the first trusted user gesture and when returning to the tab.
    const unlockAudio = () => simAudio.unlock();
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
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
      if (this.tickSpiderPresence()) return;
      if (this.spiderStage > 0 && !this.state.flags.spider_defeated && !this.state.flags.spider_released) return;
      if (this.threatActive || Date.now() < this.threatCooldown || this.state.defeated) return;
      const stayed = Date.now() - this.roomEnteredAt;
      this.tickMaskEffects();
      const dangerFill = document.getElementById('dangerFill') as HTMLElement | null;
      const dangerValue = document.getElementById('dangerValue');
      const watchValue = document.getElementById('watchValue');
      const activeNoise = this.currentSoundLevel >= 38;
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
      const lightChance = this.lightActive && !this.maskWorn ? .22 : 0;
      const soundChance = this.currentSoundLevel >= 24 ? Math.min(.24, .025 + this.currentSoundLevel * .0022) : 0;
      const dwellChance = stayed > 45000 ? Math.min(.18, .035 + stayed / 900000 + this.currentSoundLevel * .001) : 0;
      const encounter = Math.random();
      const totalChance = lightChance + soundChance + dwellChance;
      if (totalChance > 0 && encounter < Math.min(.42, totalChance)) {
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


  // Spider arc: an uncanny apparition -> stalking shadow -> active hunter -> full encounter.
  private tickSpiderPresence(): boolean {
    if (document.getElementById('spiderDialogue')) return true;
    if (this.state.flags.spider_defeated || this.state.flags.spider_released || this.state.defeated ||
        document.body.classList.contains('combat-active') || this.threatActive) return false;
    if (Date.now() < this.spiderNextAt) return false;
    if (this.spiderStage === 0) {
      const eligible = this.state.visited.length >= 2 || this.state.sanity < 82 || this.state.flags.black_seed_taken;
      if (eligible && Math.random() < .075) { this.openSpiderBeat(0); return true; }
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
      ['ОНА ПЕРЕСТАЛА ПРЯТАТЬСЯ','Из тени вытягиваются длинные пальцы. «Я знаю короткий путь. Я держала дверь, пока остальные уходили. Ты ведь не оставишь меня здесь снова?»','Спросить, кого она ждала','Позвонить в колокольчик','Принять протянутую руку'],
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
    const actions = [['look','ignore','call'],['steady','thread','turn'],['ask','bell','hand'],['fight','run','surrender']][stage];
    for (let n=0;n<3;n++) {
      const btn=document.createElement('button'); btn.type='button'; btn.className='spider-choice';
      const strong=document.createElement('strong'); strong.textContent=lines[stage][n+2];
      const hint=document.createElement('small'); hint.textContent=[
        ['Не отводить взгляд и рассмотреть лицо.','Не провоцировать то, чего пока не понимаешь.','Проверить, ответит ли оно.'],
        ['Сохранить спокойный шаг.','Предложить нить вместо руки.','Попытаться поймать её на движении.'],
        ['Выслушать, не обещая ничего.','Звук может разорвать её форму.','Она обещает вывести тебя. Цена неизвестна.'],
        ['Не дать ей приблизиться.','Шанс уйти есть, но она успеет задеть тебя.','Самый опасный выбор. Неизвестно, отпустит ли она.']
      ][stage][n];
      btn.append(strong,hint); btn.addEventListener('click',()=>this.chooseSpider(actions[n])); choices.appendChild(btn);
    }
    panel.append(title,copy,choices); document.body.appendChild(panel); requestAnimationFrame(()=>panel.classList.add('visible'));
    if(this.spiderDialogTimer) clearTimeout(this.spiderDialogTimer as number);
    this.spiderDialogTimer=window.setTimeout(()=>{if(document.getElementById('spiderDialogue'))this.chooseSpider('ignore')},stage===3?9500:14500);
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
      if(action==='look'){this.state.flags.spider_recognized=true;this.state.sanity=Math.min(100,this.state.sanity+2);this.notify('На её лице нет глаз. Но ты понял: она ждёт, когда её назовут. +2 рассудка.','ok');this.spiderNextAt=Date.now()+52000;}
      else if(action==='call'){this.state.flags.spider_called=true;this.makeNoise('Ты окликнул фигуру. Она повторила твоё имя с задержкой.');this.spiderNextAt=Date.now()+18000;}
      else {this.notify('Ты отвёл взгляд. На мокрых досках остался след босой ступни.','info');this.spiderNextAt=Date.now()+26000;}
      this.spiderStage=1;
    } else if(this.spiderStage===1) {
      if(action==='thread'&&hasThread){this.state.inventory=this.state.inventory.filter(x=>x!=='silk_thread');this.state.flags.used_silk_thread=true;this.state.flags.spider_thread_given=true;this.state.flags.spider_released=true;this.spiderStage=0;this.notify('Нить натянулась сама собой и ушла в темноту. Паутина ослабла. Впервые за всё время шаги за спиной стихли.','ok');this.spiderNextAt=Date.now()+99999999;}
      else if(action==='steady'){this.state.flags.spider_stared_down=true;this.notify('Ты не обернулся. Тень отстала, но не исчезла.','ok');this.spiderNextAt=Date.now()+42000;}
      else {this.state.sanity=Math.max(0,this.state.sanity-4);this.notify(action==='thread'?'Нити нет. Тень касается твоей пятки.':'Тень рванулась раньше, чем ты успел её поймать.','warn');this.spiderNextAt=Date.now()+9000;}
      this.spiderStage=2;
    } else if(this.spiderStage===2) {
      if(action==='ask'){this.state.flags.spider_story_heard=true;this.state.sanity=Math.max(0,this.state.sanity-2);this.notify('«Меня оставили под домом. Я держала дверь, пока они уходили».','info');this.spiderStage=3;this.spiderNextAt=Date.now()+34000;}
      else if(action==='bell'&&hasBell){this.state.inventory=this.state.inventory.filter(x=>x!=='copper_bell');this.state.flags.used_copper_bell=true;this.notify('Колокольчик раскалывает тишину. Паутина отступает, но обещает вернуться.','ok');this.spiderStage=3;this.spiderNextAt=Date.now()+65000;}
      else if(action==='hand'){
        const risk=Math.min(.78,(this.state.sanity<30?.48:this.state.sanity<55?.31:.16)+(this.maskWorn?.12:0)+(this.state.inventory.includes('black_seed')?.12:0));
        this.state.flags.spider_hand_taken=true;
        if(Math.random()<risk){this.state.health=0;this.state.sanity=0;this.notify('«Я выведу тебя», — шепчет она. Пальцы смыкаются с другой стороны кожи.','warn');saveState(this.state);this.renderVitals();this.checkDefeat();return;}
        this.state.sanity=Math.max(0,this.state.sanity-22);this.notify('Она отпустила тебя. На ладони осталась чёрная нить под кожей.','warn');this.spiderStage=3;this.spiderNextAt=Date.now()+12000;
      } else {this.state.sanity=Math.max(0,this.state.sanity-7);this.spiderStage=3;this.spiderNextAt=Date.now()+14000;this.notify('Тень рвётся к тебе. Теперь она больше не скрывается.','warn');}
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

  private startThreat(kind: 'light' | 'sound' | 'dweller' = 'dweller') {
    if (document.body.classList.contains('combat-active') || this.threatActive) return;
    this.threatKind = kind;
    this.threatActive = true;
    this.updateAwareness(2); this.state.sanity = Math.max(0,this.state.sanity-5); saveState(this.state); this.renderVitals();
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
    this.updateAwareness(Date.now() < this.noiseUntil ? 1 : 0);
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
      paper_lantern_shard: 'lantern_shard', wet_key_half: 'key_half_1', wet_key_other: 'key_half_2',
      ryokan_key: 'key', kokeshi_note: 'scroll', silk_thread: 'rope', matchbox: 'matches',
      medicinal_herbs: 'herbs', copper_bell: 'bell', herbal_poultice: 'bandage',
      warding_charm: 'amulet', ember_lantern: 'lantern', black_seed: 'black_seed',
      stitched_mask: 'doll',
    };
    return '/assets/game/items/' + (files[id] || 'mirror_shard') + '.png';
  }

  private buildHotspots() {
    this.hsLayer.innerHTML = '';
    for (const hs of hotspotsFor(this.state.location)) {
      if (hs.id === 'hs_door' && this.state.flags.door_unlocked) continue;
      const allFinds = hs.items?.length ? hs.items : (hs.item ? [hs.item] : []);
      const allFlags = hs.takenFlags?.length ? hs.takenFlags : (hs.takenFlag ? [hs.takenFlag] : []);
      if (allFinds.length && allFlags.length && allFinds.every((_, i) => !!this.state.flags[allFlags[i] || ''])) continue;
      if (!allFinds.length && hs.takenFlag && this.state.flags[hs.takenFlag]) continue;
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
      const firstAvailable = allFinds.find((id, index) => {
        const flag = allFlags[index] || hs.takenFlag;
        return !flag || !this.state.flags[flag];
      });
      const inspected = !!this.state.flags['inspected_' + hs.id];
      b.dataset.hotspotId = hs.id;
      b.setAttribute('aria-label', (allFinds.length ? 'Осмотреть находку: ' : 'Осмотреть: ') + hs.label);
      if (inspected) b.classList.add('inspected');
      const itemMarkup = inspected && firstAvailable
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
    // Distinct footsteps before the transition, followed by a soft movement whoosh.
    simAudio.steps(this.state.muted);
    window.setTimeout(() => simAudio.steps(this.state.muted), 230);
    window.setTimeout(() => simAudio.steps(this.state.muted), 470);
    window.setTimeout(() => simAudio.whoosh(this.state.muted), 590);
    this.makeNoise('Шаги эхом разнеслись по локации.');
    this.state.location = to;
    this.roomEnteredAt = Date.now();
    this.noiseStartedAt = Date.now(); this.noiseDuration = 4500; this.noisePeak = 58;
    this.noiseUntil = this.noiseStartedAt + this.noiseDuration;
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
    // The location title is already shown in the fixed scene header; do not duplicate it as a toast.
    this.pulseMatrix('ok');
    simAudio.open(this.state.muted);
  }

  private onHotspot(hs: HotspotDef, element?: HTMLButtonElement) {
    simAudio.click(this.state.muted);
    this.state.flags['inspected_' + hs.id] = true;
    this.state.flags['examined_' + hs.id] = true;
    saveState(this.state);
    this.buildHotspots();
    this.spawnInspectBurst(hs.x, hs.y);

    // Contextual item use: these interactions are intentionally tied to visible world objects.
    const selected = this.state.selected;
    const contextual: Partial<Record<ItemId, Partial<Record<string, { flag: string; message: string; consume?: boolean; sanity?: number }>>>> = {
      silk_thread: {
        hs_note: { flag: 'threaded_note', message: 'Ты закрепил записку нитью. На обороте проступила строка: «Якорь слушает то, что принесено из трёх комнат».' },
      },
      matchbox: {
        hs_lantern: { flag: 'world_lantern_lit', message: 'Сырая спичка вспыхивает на миг. Внутри фонаря проявляется знак Цефея.', consume: true },
      },
      warding_charm: {
        hs_anchor: { flag: 'anchor_warded', message: 'Оберег впитывается в контур якоря. Шёпот на секунду стихает.', consume: true },
      },
      ember_lantern: {
        hs_anchor: { flag: 'anchor_lit', message: 'Ты ставишь тлеющий фонарь в гнездо якоря. Контур удерживает свет.', consume: true },
      },
      copper_bell: {
        hs_anchor: { flag: 'anchor_warned', message: 'Безъязыкий колокольчик дрожит у якоря. Изнутри отвечают тремя ударами.' },
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
      if (contextualUse.consume) this.state.inventory = this.state.inventory.filter(id => id !== selected);
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
          row.addEventListener('click', () => showItem(id));
          list.appendChild(row);
        });
        body.appendChild(list);
        addAction('ОСТАВИТЬ ВСЁ КАК ЕСТЬ', 'quiet', () => {
          this.notify('Мы решили пока ничего не трогать.', 'info');
          this.closeModal();
        });
        if (note) note.textContent = 'Среди следов есть что-то ещё. Каждую находку можно рассмотреть отдельно.';
      } else if (hs.complete) {
        addAction('ВЫБРАТЬ ИСХОД', 'primary', () => this.showEndingChoices());
        if (note) note.textContent = 'Канал ждёт решения.';
      } else {
        const empty = document.createElement('p');
        empty.className = 'discovery-empty';
        empty.textContent = 'Больше ничего заметного. Но ощущение чужого присутствия не исчезает.';
        body.appendChild(empty);
        addAction('ЗАКРЫТЬ ОСМОТР', 'quiet', () => this.closeModal());
        if (note) note.textContent = 'Мы запомнили это место.';
      }
    };

    const showItem = (id: ItemId) => {
      const item = ITEMS[id];
      const index = found.indexOf(id);
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
          letter.innerHTML = '<div class="note-letter-stamp">ЛИЧНАЯ ЗАПИСЬ · М.</div><p>Если ты читаешь это, значит, дверь уже закрылась за тобой. Не верь шагам, которые повторяют твои. Это не эхо — оно учится.</p><p>Первый ключ лежит там, где вода не отражает небо. Вторую половину спрятали под доской, отмеченной тремя короткими царапинами. Соедини их, но не открывай дверь, пока не найдёшь нить.</p><p>Нить удерживает бумагу. Бумага помнит огонь. А колокольчик без языка всё ещё может предупредить того, кто слушает не ушами.</p><p class="note-sign">М. · если маска заговорит твоим голосом — не отвечай.</p>';
          body.querySelector('.note-letter')?.remove();
          body.appendChild(letter);
          this.state.flags.note_read = true;
          this.state.flags.clue_key_halves = true;
          saveState(this.state);
          read.textContent = 'ПЕРЕЧИТАТЬ ЗАПИСКУ';
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
        if (id === 'black_seed') {
          this.state.sanity = Math.max(0, this.state.sanity - 13);
          this.notify('Семя дёрнулось в ладони. Рассудок пошатнулся.', 'warn');
          simAudio.whisper(this.state.muted);
        } else if (id === 'stitched_mask') {
          this.state.sanity = Math.max(0, this.state.sanity - 8);
          this.notify('Из маски донёсся короткий вдох.', 'warn');
          simAudio.maskWhisper(this.state.muted, 1.1);
        } else this.notify('Получено: ' + (item?.name || 'предмет'), 'ok');
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
        simAudio.whisper(this.state.muted);
        this.showSense('◉', 'Мы изучили: ' + (item?.name || 'находку'), false);
      });

      if (note) note.textContent = id === 'stitched_mask' || id === 'black_seed'
        ? 'Риск неизвестен. Можно забрать находку, изучить её или оставить.'
        : 'Решение остаётся за нами. Вещь не исчезнет, если мы уйдём без неё.';
    };

    body.classList.remove('thought-text');
    showArea();
    modal.classList.add('open');
    document.body.classList.add('inspection-open');
    simAudio.open(this.state.muted);
  }

  private showEndingChoices() {
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
      intro.textContent='Канал закрывается. Зафиксируй выход из сектора — Цефей сохранит состояние узла и перенесёт тебя за его пределы.';
      body.appendChild(intro);
      const status=document.createElement('p');status.className='ending-outcome-copy';
      status.textContent='Сбор данных завершится после выхода. Сейчас не будет ни оценки, ни списка находок — только закрытие сектора.';
      body.appendChild(status);
    }
    if (actions) {
      actions.innerHTML='';
      const ready=['note_read','door_unlocked','took_silk','took_bell','crafted_warding_charm','crafted_ember_lantern'].every(flag=>!!this.state.flags[flag]);
      const button=document.createElement('button');
      button.type='button';button.className='inspection-action primary ending-good';
      button.textContent='ВЫЙТИ ИЗ СЕКТОРА';
      button.addEventListener('click',()=>this.chooseEnding(ready?'clear':'break'));
      actions.appendChild(button);
      const back=document.createElement('button');back.type='button';back.className='inspection-action quiet';
      back.textContent='ОСТАТЬСЯ В СЕКТОРЕ';back.addEventListener('click',()=>this.closeModal());actions.appendChild(back);
    }
    if (note) note.textContent='Сначала выход. Отчёт Цефея появится после завершения перехода.';
  }

  private showRunReport() {
    const title=document.getElementById('modalTitle');
    const body=document.getElementById('modalBody');
    const visual=document.getElementById('modalVisual');
    const actions=document.getElementById('modalActions');
    const note=document.getElementById('modalNote');
    if(title)title.textContent='ЦЕФЕЙ · ОТЧЁТ ПОСЛЕ ВЫХОДА';
    if(visual)visual.innerHTML='<div class="ending-core-art" aria-hidden="true"><i></i><b></b><span></span></div>';
    const allItems=Object.keys(ITEMS) as ItemId[];
    const collected=allItems.filter(id=>this.state.flags['collected_'+id]||this.state.flags['crafted_'+id]||this.state.inventory.includes(id));
    const used=allItems.filter(id=>this.state.flags['used_'+id]);
    const dangerous=['black_seed','stitched_mask'] as ItemId[];
    const dangerousTaken=dangerous.filter(id=>this.state.flags['collected_'+id]||this.state.inventory.includes(id));
    const dangerousUsed=dangerous.filter(id=>this.state.flags['used_'+id]);
    const requirements:[string,boolean][]=[
      ['Записка прочитана',!!this.state.flags.note_read],
      ['Дверь генкана открыта',!!this.state.flags.door_unlocked],
      ['Нить найдена',!!this.state.flags.took_silk],
      ['Колокольчик найден',!!this.state.flags.took_bell],
      ['Оберег собран',!!this.state.flags.crafted_warding_charm],
      ['Фонарь восстановлен',!!this.state.flags.crafted_ember_lantern],
    ];
    if(body){
      body.innerHTML='';
      const intro=document.createElement('p');intro.className='inspection-description';
      intro.textContent='Выход подтверждён. Теперь Цефей сверяет маршрут, находки и решения, принятые внутри сектора.';
      body.appendChild(intro);
      const list=document.createElement('ul');list.className='ending-requirements';
      const rows:[string,string][]=[
        ['Найдено предметов',String(collected.length)],
        ['Применено предметов',String(used.length)],
        ['Осталось в инвентаре',String(this.state.inventory.length)],
        ['Опасные предметы взяты',dangerousTaken.map(id=>ITEMS[id].name).join(', ')||'нет'],
        ['Опасные предметы применены',dangerousUsed.map(id=>ITEMS[id].name).join(', ')||'нет'],
        ['Встреченные существа',['light','sound','dweller'].filter(k=>this.state.flags['encounter_'+k]).join(', ')||'нет'],
        ['Получены ранения',this.state.flags.combat_hit_taken?'да':this.state.flags.combat_dodged?'нет · удалось уклониться':'не зафиксировано'],
        ['Отступление',this.state.flags.combat_fled?'да':'нет'],
      ];
      rows.forEach(([label,value])=>{const li=document.createElement('li');li.textContent=label+': '+value;list.appendChild(li);});
      body.appendChild(list);
      const found=document.createElement('p');found.className='ending-outcome-copy';
      found.textContent='Собрано: '+(collected.map(id=>ITEMS[id].name).join(' · ')||'ничего')+'.';body.appendChild(found);
      const spent=document.createElement('p');spent.className='ending-outcome-copy';
      spent.textContent='Применено: '+(used.map(id=>ITEMS[id].name).join(' · ')||'ничего')+'.';body.appendChild(spent);
      const checklist=document.createElement('ul');checklist.className='ending-requirements';
      requirements.forEach(([label,met])=>{const li=document.createElement('li');li.textContent=(met?'✓ ':'— ')+label;li.className=met?'met':'missing';checklist.appendChild(li);});
      body.appendChild(checklist);
      const outcome=document.createElement('p');outcome.className='ending-outcome-copy';
      outcome.textContent=this.state.ending==='clear'?'Итог: канал очищен. Память сектора сохранена.':'Итог: канал разорван. Часть памяти сектора потеряна.';
      body.appendChild(outcome);
    }
    if(actions){
      actions.innerHTML='';
      const button=document.createElement('button');button.type='button';button.className='inspection-action primary ending-good';
      button.textContent='ПРОДОЛЖИТЬ';button.addEventListener('click',()=>{this.closeModal();window.location.href='/scene-ryokan.html';});actions.appendChild(button);
    }
    if(note)note.textContent='Отчёт сформирован после выхода. Состояние предметов и ключевые события сохранены.';
    document.getElementById('simModal')?.classList.add('open');
    document.body.classList.add('inspection-open');
    simAudio.open(this.state.muted);
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
    this.notify('ВЫХОД ИЗ СЕКТОРА · '+copy,'ok');
    this.showSense('◇','Сектор покинут. Данные переданы Цефею.',ending !== 'clear');
    this.stage.classList.add('sector-exit');
    document.body.classList.add('sector-exit-active');
    window.setTimeout(()=>this.showRunReport(),1100);
  }

  private closeModal() {
    document.getElementById('simModal')?.classList.remove('open');
    document.body.classList.remove('inspection-open');
    document.querySelectorAll('.hotspot.being-inspected').forEach(node => node.classList.remove('being-inspected'));
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
      slot.innerHTML = `<img class="inventory-item-art" src="${this.itemAsset(id)}" alt="${def.name}" draggable="false"><span class="n">${def.short}</span>`;
      slot.title = def.name + ' · ЛКМ выбрать · ПКМ осмотр';
      slot.addEventListener('click', () => this.onInv(id));
      slot.addEventListener('focus', () => simAudio.hover(this.state.muted));
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
    this.noiseDuration = 14000;
    this.noisePeak = Math.min(100, carriedLevel + 24);
    this.noiseUntil = now + this.noiseDuration;
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
    el.innerHTML = `<img class="creature-sprite" src="/assets/game/creatures/${this.threatKind === 'light' ? 'blind' : this.threatKind === 'sound' ? 'listener' : 'lodger'}.png" alt=""><span class="creature-eyes"></span><i></i><b></b><span class="creature-dialogue">${creatureLine}</span>`;
    el.setAttribute('aria-label', this.threatKind === 'light' ? 'Слепой' : this.threatKind === 'sound' ? 'Слушатель' : 'Жилец');
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
    this.monsterName = this.spiderInCombat ? 'ПАУТИННИЦА' : this.threatKind === 'light' ? 'СЛЕПОЙ' : this.threatKind === 'sound' ? 'СЛУШАТЕЛЬ' : 'ЖИЛЕЦ';
    this.combatTurn = 0; this.combatTarget = 'torso';
    this.state.flags['encounter_' + this.threatKind] = true;
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
    const screen = document.getElementById('combatScreen'); screen?.classList.add('open'); screen?.setAttribute('aria-hidden','false');
    const dodge = document.getElementById('combatDodge') as HTMLButtonElement | null; if (dodge) dodge.disabled = true;
    document.body.classList.add('combat-active');
    this.renderCombatWounds();
    this.renderCombatInventory();
    const creatureVoice: Record<string,string> = {
      spider: 'Паутинница шепчет: «Ты всё-таки пришёл. Я оставила тебе место между нитями».',
      light: 'Слепой шепчет: «Свет… ты принёс мне глаза. Отдай их обратно».',
      sound: 'Слушатель отвечает твоим голосом: «Не зови. Я уже запомнил, как ты звучишь».',
      dweller: 'Жилец скребёт по полу: «Под досками ещё кто-то. Он считает шаги вместо нас».',
    };
    this.updateCombatHud(this.spiderInCombat ? creatureVoice.spider : creatureVoice[this.threatKind]);
    this.state.flags['heard_' + this.threatKind] = true;
    saveState(this.state);
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
          : { usable: false, reason: 'Слепой идёт на свет. Фонарь только ускорит его атаку.' };
      case 'stitched_mask':
        return { usable: true, reason: 'Чужой голос маски заставит существо отшатнуться, но отнимет 6 рассудка.' };
      case 'copper_bell':
        return this.threatKind === 'sound' || this.threatKind === 'dweller'
          ? { usable: true, reason: 'Собьёт ритм атаки и замедлит существо.' }
          : { usable: false, reason: 'Слепой реагирует на звук слишком резко. Звонок опасен.' };
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
    for (const id of this.state.inventory) {
      const def = ITEMS[id];
      const info = this.combatItemInfo(id);
      const selected = this.state.selected === id;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'combat-item-card' + (info.usable ? ' is-usable' : ' is-unusable') + (selected ? ' is-selected' : '');
      card.disabled = !info.usable || this.dodgeReady;
      card.style.setProperty('--item-tint', def.color);
      card.setAttribute('aria-label', def.name + '. ' + info.reason);
      card.innerHTML = '<img src="' + this.itemAsset(id) + '" alt="" draggable="false"><strong></strong><small></small>';
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
        log = this.threatKind === 'light' ? 'Слепой не боится света. Он бросается ближе.' : 'Пламя обжигает тварь. +18 инициативы.';
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
      if (['herbal_poultice','medicinal_herbs','warding_charm','matchbox'].includes(id)) this.state.inventory = this.state.inventory.filter(x => x !== id);
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
    if (this.spiderInCombat) return 'Паутинница поднимает руки. Между пальцами натягиваются нити.';
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
    const windowMs=this.state.injuries.includes('leg')?900:this.enemyLegsSlowed?1900:this.threatKind==='light'?1450:this.threatKind==='sound'?1750:1600;
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
    const duration = this.threatKind === 'light' ? 9500 : this.threatKind === 'sound' ? 8000 : 7200;
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
        this.state.flags['used_' + recipe.a] = true;
        this.state.flags['used_' + recipe.b] = true;
        this.state.inventory = this.state.inventory.filter((x) => x !== recipe.a && x !== recipe.b);
        if (!this.state.inventory.includes(recipe.result)) this.state.inventory.push(recipe.result);
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
        examBody.textContent = 'ЛИЧНАЯ ЗАПИСЬ · М.\\n\\nЕсли ты читаешь это, значит, дверь уже закрылась за тобой. Не верь шагам, которые повторяют твои. Это не эхо — оно учится.\\n\\nПервый ключ лежит там, где вода не отражает небо. Вторую половину спрятали под доской с тремя царапинами. Соедини их, но не открывай дверь, пока не найдёшь нить.\\n\\nНить удерживает бумагу. Бумага помнит огонь. Колокольчик без языка всё ещё может предупредить того, кто слушает не ушами.\\n\\nМ. · если маска заговорит твоим голосом — не отвечай.';
        this.state.flags.note_read = true;
        this.state.flags.clue_key_halves = true;
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
