/* madness-fx.js — рассудок, галлюцинации, звуки, подход монстров.
   Подключение: <script type="module" src="/src/madness-fx.js"></script> (после main-sim.ts)
   Читает рассудок из #sanityValue. Отладка: ?sanity=40 в адресе или RkFx.setSanity(40) в консоли. */
   const $ = s => document.querySelector(s), R = Math.random, rnd = (a, b) => a + R() * (b - a), pick = a => a[R() * a.length | 0];
   const el = (t, c, p) => { const e = document.createElement(t); if (c) e.className = c; if (p) p.appendChild(e); return e };
   const B = document.body, stage = $('#simStage'), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
   let sanity = 100, g = 0, u = 0; // g — искажение (рассудок < 65%), u — тревога (< 88%)
   
   /* ---------- слои и SVG-фильтр искажения ---------- */
   const L = el('div', 'fx-layer', stage); L.id = 'fxLayer';
   L.innerHTML = '<canvas id="fxGrain" width="160" height="90"></canvas><div id="fxVein"></div><div id="fxRoll"></div>';
   const svgHost = el('div', '', B);
   svgHost.innerHTML = `<svg width="0" height="0" style="position:absolute"><filter id="rkWarp" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
   <feTurbulence id="rkT" type="fractalNoise" baseFrequency="0.004 0.1" numOctaves="2" result="n"/>
   <feDisplacementMap id="rkD" in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G" result="d"/>
   <feColorMatrix in="d" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
   <feColorMatrix in="d" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb"/>
   <feOffset in="r" id="rkR" dx="0" dy="0" result="ro"/><feBlend in="ro" in2="gb" mode="screen"/></filter></svg>`;
   const gctx = $('#fxGrain').getContext('2d'), gimg = gctx.createImageData(160, 90);
   setInterval(() => { if (!g) return; const d = gimg.data; for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = R() * 255; d[i + 3] = 255 } gctx.putImageData(gimg, 0, 0) }, 90);
   
   /* ---------- рассудок ---------- */
   function setSanity(v) {
     if (isNaN(v)) return;
     sanity = Math.max(0, Math.min(100, v));
     g = sanity < 65 ? (65 - sanity) / 65 : 0; u = Math.max(0, Math.min(1, (88 - sanity) / 88));
     B.style.setProperty('--g', g.toFixed(3)); B.style.setProperty('--u', u.toFixed(3));
     if (g) B.dataset.fx = g > .6 ? 'high' : g > .3 ? 'mid' : 'low'; else delete B.dataset.fx;
     if (dg) dg.gain.setTargetAtTime(g * .1 + u * .02, ac.currentTime, 1.2);
   }
   const sv = $('#sanityValue');
   if (sv) { new MutationObserver(() => setSanity(parseFloat(sv.textContent))).observe(sv, { childList: true, characterData: true, subtree: true }); setSanity(parseFloat(sv.textContent)) }
   const q = new URLSearchParams(location.search).get('sanity'); if (q) setSanity(+q);
   
   /* ---------- планировщик ---------- */
   function every(fn, a, b, k) {
     const go = () => { const x = k(); setTimeout(() => { if (k() > 0 && !document.hidden) try { fn() } catch (e) { } go() }, x > 0 ? rnd(a, b) / (.3 + x * 1.7) : 2000) };
     go();
   }
   const swapText = (e, t, ms = 450) => { if (!e || e._sw) return; const o = e.textContent; e._sw = 1; e.textContent = t; setTimeout(() => { if (e.textContent === t) e.textContent = o; e._sw = 0 }, ms) };
   const GL = '▓▒░█▌╳#@%&?¤§ЖѪ';
   function scramble(e, ms = 500) {
     if (!e || e._sw) return; const t = e.textContent; e._sw = 1; let n = 0;
     const id = setInterval(() => { e.textContent = [...t].map(c => c === ' ' || R() > .4 + g * .3 ? c : pick(GL)).join(''); if (++n > ms / 60) { clearInterval(id); e.textContent = t; e._sw = 0 } }, 60);
   }
   
   /* ---------- ЗВУК (WebAudio, без файлов) ---------- */
   let ac, master, nb, dg;
   const unlock = () => {
     if (!ac) {
       try {
         ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.connect(ac.destination);
         const n = ac.sampleRate * 2; nb = ac.createBuffer(1, n, ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < n; i++) d[i] = R() * 2 - 1;
         const o1 = ac.createOscillator(), o2 = ac.createOscillator(); dg = ac.createGain(); dg.gain.value = 0; o1.frequency.value = 43; o2.frequency.value = 45.3;
         o1.connect(dg); o2.connect(dg); dg.connect(master); o1.start(); o2.start(); setSanity(sanity);
       } catch (e) { }
     }
     if (ac && ac.state === 'suspended') ac.resume();
   };
   ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, unlock, { passive: true }));
   const muted = () => /OFF/i.test($('#btnMute')?.textContent || '');
   setInterval(() => { if (master) master.gain.value = muted() ? 0 : .55 }, 400);
   const off = () => !ac || ac.state !== 'running' || muted();
   const chain = (a, pan) => { const p = ac.createStereoPanner(); p.pan.value = pan; a.reduce((x, y) => x.connect(y)); a[a.length - 1].connect(p); p.connect(master) };
   function noise(t, d, f, qf, v, pan = 0, f2) {
     const s = ac.createBufferSource(); s.buffer = nb; s.loop = true;
     const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.setValueAtTime(f, t); if (f2) b.frequency.exponentialRampToValueAtTime(f2, t + d); b.Q.value = qf;
     const gn = ac.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(v, t + d * .3); gn.gain.linearRampToValueAtTime(0, t + d);
     chain([s, b, gn], pan); s.start(t); s.stop(t + d + .05);
   }
   function tone(t, d, f, f2, v, type = 'sine', pan = 0) {
     const o = ac.createOscillator(), gn = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f2, t + d);
     gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(.0001, t + d); chain([o, gn], pan); o.start(t); o.stop(t + d + .05);
   }
   const sfx = {
     whisper() { if (off()) return; let t = ac.currentTime, p = rnd(-1, 1); for (let i = 0, n = 3 + R() * 5 | 0; i < n; i++) { const d = rnd(.1, .3), f = rnd(900, 3400); noise(t, d, f, 9, .07 + u * .07, p, f * rnd(.6, 1.5)); t += d * rnd(.8, 1.5) } },
     steps(n = 4, v = .12) { if (off()) return; let t = ac.currentTime, p = rnd(-1, 1); for (let i = 0; i < n; i++) { tone(t, .14, 80, 38, v, 'sine', p); noise(t, .07, 320, 1, v * .4, p); t += rnd(.45, .7) } },
     scrape() { if (off()) return; noise(ac.currentTime, 1.4, 4200, 3, .05 + u * .05, rnd(-1, 1), 700) },
     bell() { // колокол наоборот
       if (off()) return; const t = ac.currentTime, o = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), gn = ac.createGain();
       o.frequency.value = rnd(200, 520); m.frequency.value = o.frequency.value * 1.41; mg.gain.value = 180; m.connect(mg); mg.connect(o.frequency);
       gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(.07, t + 1.6); gn.gain.setValueAtTime(0, t + 1.65); chain([o, gn], rnd(-1, 1)); o.start(t); m.start(t); o.stop(t + 1.7); m.stop(t + 1.7);
     },
     glitch() { if (!off()) noise(ac.currentTime, .07, rnd(2000, 9000), .7, .06 + g * .1, rnd(-1, 1)) },
     beat(v = .3) { if (off()) return; const t = ac.currentTime; tone(t, .14, 62, 35, v); tone(t + .2, .16, 52, 32, v * .8) },
     hit() { if (off()) return; tone(ac.currentTime, .5, 95, 28, .45, 'sawtooth') }
   };
   function speak(txt) { // чужой голос
     if (muted() || !window.speechSynthesis) return;
     try { const s = new SpeechSynthesisUtterance(txt); s.lang = 'ru-RU'; s.pitch = .1; s.rate = .5; s.volume = .3 + g * .3; speechSynthesis.cancel(); speechSynthesis.speak(s) } catch (e) { }
   }
   
   /* ---------- ИСКАЖЕНИЕ ИЗОБРАЖЕНИЯ ---------- */
   function burst() {
     if (B.classList.contains('fx-burst')) return;
     $('#rkT').setAttribute('baseFrequency', `${rnd(.0005, .01).toFixed(4)} ${rnd(.02, .35).toFixed(3)}`);
     $('#rkD').setAttribute('scale', (25 + g * 110).toFixed(0)); $('#rkR').setAttribute('dx', ((R() < .5 ? -1 : 1) * (4 + g * 16)).toFixed(0));
     B.style.setProperty('--jx', rnd(-5, 5).toFixed(1) + 'px'); B.classList.add('fx-burst');
     if (!reduce && R() < g * .18) B.classList.add('fx-inv');
     setTimeout(() => B.classList.remove('fx-burst', 'fx-inv'), rnd(70, 200 + g * 260)); sfx.glitch();
   }
   function hudGlitch() {
     const k = R();
     if (k < .3) scramble($('#zoneLabel')); else if (k < .5) swapText($('#zoneLabel'), pick(['ВЫХОДА НЕТ', 'ОН ЗА ТОБОЙ', 'ТЫ ЗДЕСЬ']), 600);
     else if (k < .7) swapText($('#worldTime'), pick(['??:??', '04:37', '99:99', '00:00']), 500);
     else if (k < .85) swapText($('#healthValue'), String(R() * 99 | 0), 350); else scramble($('#soundCaption'), 700);
   }
   
   /* ---------- ТЕНИ, СИЛУЭТЫ, ГЛАЗА, ЛИК ---------- */
   function shadow() {
     const e = el('div', 'fx-shadow', L), left = R() < .5, h = rnd(160, 420);
     Object.assign(e.style, { height: h + 'px', width: rnd(60, 170) + 'px', bottom: rnd(-40, 60) + 'px', [left ? 'left' : 'right']: '-10%' });
     const dx = (left ? 1 : -1) * innerWidth * rnd(.25, .9);
     e.animate([{ transform: 'translate(0,0) scaleY(.8)', opacity: 0 }, { opacity: .3 + u * .55, offset: .3 }, { transform: `translate(${dx}px,${rnd(-30, 30)}px) scaleY(1.2)`, opacity: 0 }], { duration: rnd(3500, 9000), easing: 'ease-in-out' }).onfinish = () => e.remove();
   }
   function sil() { // ложный силуэт: стоит, подаётся ближе, исчезает рывком
     const e = el('div', 'fx-sil' + (R() < .4 ? ' eyes' : ''), L), h = rnd(180, 380), o = .5 + g * .4;
     Object.assign(e.style, { height: h + 'px', width: h * .33 + 'px', left: rnd(4, 86) + '%', bottom: rnd(-6, 10) + '%' });
     e.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: o, transform: 'scale(1)', offset: .35 }, { opacity: o, transform: 'scale(1.1)', offset: .92 }, { opacity: 0, transform: 'scale(1.12)' }], { duration: rnd(1500, 3300) }).onfinish = () => e.remove();
     if (R() < .5) sfx.steps(2, .05);
   }
   function eyes() {
     const e = el('div', 'fx-eyes', L); Object.assign(e.style, { left: rnd(5, 90) + '%', top: rnd(20, 75) + '%' });
     e.animate([{ opacity: 0 }, { opacity: .9, offset: .2 }, { opacity: 0, offset: .3 }, { opacity: .9, offset: .4 }, { opacity: .9, offset: .8 }, { opacity: 0 }], { duration: rnd(2000, 4500) }).onfinish = () => e.remove();
   }
   const VOICES = ['«Ты здесь… навсегда…»', '«Это ты?»', '«Мы слышим тебя»', '«Не оборачивайся»', '«Сзади»', '«Ты уже был здесь»', '«Открой»', '«Мы — это ты»', '«Почему ты не отвечаешь?»'];
   function voice(txt) {
     txt = txt || pick(VOICES); const w = el('div', 'fx-whisper', L); w.textContent = txt;
     w.animate([{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }], { duration: 3600 }).onfinish = () => w.remove();
     sfx.whisper(); speak(txt.replace(/[«»…]/g, ''));
   }
   function face() {
     const f = el('img', 'fx-face', L); f.src = $('#combatMonsterSprite')?.getAttribute('src') || '/assets/game/creatures/listener.png';
     f.animate([{ opacity: 0 }, { opacity: .85, offset: .1 }, { opacity: .2, offset: .2 }, { opacity: .9, offset: .35 }, { opacity: 0 }], { duration: rnd(500, 1100) }).onfinish = () => f.remove();
     burst(); sfx.scrape(); if (R() < .6) voice();
   }
   function fakeTarget() { // ложная цель взаимодействия на пустом месте
     const r = $('#targetReticle'), p = $('#interactPrompt'); if (!r || !p || !r.hidden) return;
     r.style.left = rnd(15, 75) + '%'; r.style.top = rnd(25, 65) + '%'; p.style.left = `calc(${r.style.left} + 64px)`; p.style.top = `calc(${r.style.top} - 6%)`;
     const n = $('#promptName'), a = $('#promptAction'); if (n) n.textContent = pick(['Кто-то', 'Это ты?', 'Дверь (её не было)', 'Не смотри']); if (a) a.textContent = pick(['Осмотреть', 'Позвать', 'Не трогать']);
     r.hidden = p.hidden = false; setTimeout(() => { r.hidden = p.hidden = true }, rnd(1200, 2200));
   }
   
   /* ---------- ИНВЕНТАРЬ ---------- */
   function invFx() {
     const inv = $('#invSlots'); if (!inv) return; const k = [...inv.children].filter(c => !c.classList.contains('fx-fake')); if (k.length < 2) return;
     const m = R(), cnt = $('#inventoryCount'), a = pick(k), b = pick(k), rm = (c, ms) => setTimeout(() => c.classList.remove('fx-q', 'fx-eye', 'fx-melt'), ms);
     if (m < .25) { k.forEach((c, i) => c.style.order = i); a.style.order = k.indexOf(b); b.style.order = k.indexOf(a); setTimeout(() => k.forEach(c => c.style.order = ''), rnd(1500, 3500)) }
     else if (m < .5) { a.classList.add('fx-q'); rm(a, rnd(1000, 3000)) }
     else if (m < .65) { a.classList.add('fx-eye'); rm(a, 1800) }
     else if (m < .8) { a.classList.add('fx-melt'); rm(a, 2200) }
     else { const f = b.cloneNode(true); f.classList.add('fx-fake'); f.removeAttribute('id'); inv.appendChild(f); swapText(cnt, '13 / 12', 2000); setTimeout(() => f.remove(), 2000) }
     if (R() < .4) { scramble($('#selectedItemPreview .selected-copy strong'), 600); if (g > .5) swapText($('#handLabel'), 'В РУКАХ: ???', 900) }
   }
   
   /* ---------- МЫСЛИ И ОЩУЩЕНИЯ «МЫ» ---------- */
   const TH = [
     [['mind', 'Мы ещё держимся.'], ['ear', 'Нам показалось, или кто-то вздохнул?'], ['body', 'Наши пальцы холодеют.'], ['eye', 'Нас не должно быть слышно.']],
     [['mind', 'Нас здесь больше, чем один.'], ['ear', 'Наши шаги звучат с опозданием.'], ['eye', 'Тени поворачиваются вслед за нами.'], ['body', 'В ушах — наш чужой пульс.'], ['mind', 'Мы не помним, как сюда пришли.']],
     [['mask', 'Маска шепчет нашим голосом…'], ['mind', 'Мы уже умирали здесь. Нам знакома эта стена.'], ['voice', 'Нас зовут. Мы отвечаем. Мы не открывали рта.'], ['glitch', 'Искажение реальности усиливается…'], ['body', 'Мы больше не отличаем свои руки.'], ['eye', 'В глазах рябит. Кто смотрит — мы или на нас?']]
   ];
   function think() {
     const f = $('#senseFeed'), t = TH[g > .5 ? 2 : g > .15 || u > .5 ? 1 : 0], [k, txt] = pick(t);
     if (f) { const d = el('div', '', f); d.dataset.k = k; d.textContent = txt; while (f.children.length > 6) f.firstChild.remove(); setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 700) }, rnd(7000, 12000)) }
     const iv = $('#innerVoice'); if (iv && R() < .5) { iv.textContent = txt; if (g > .4) scramble(iv, 400) }
   }
   
   /* ---------- СТРАННЫЕ ЗВУКИ ---------- */
   const snd = () => pick([sfx.whisper, () => sfx.steps(3 + R() * 3 | 0, .06 + u * .08), sfx.scrape, sfx.bell, sfx.whisper])();
   let beatT = 0; setInterval(() => { if (g > .35 && Date.now() - beatT > 1500 - g * 700) { beatT = Date.now(); sfx.beat(.12 + g * .3) } }, 200);
   
   /* ---------- МОНСТР ПРИБЛИЖАЕТСЯ ПО МЕРЕ ИСТЕЧЕНИЯ ВРЕМЕНИ ---------- */
   const cs = $('#combatScreen'), th = $('#threatOverlay'), AP = {};
   const isOpen = e => { if (!e) return false; const a = e.getAttribute('aria-hidden'); if (a === 'false' || /\b(open|active|show|on|visible)\b/.test(e.className)) return true; if (a === 'true') return false; const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > .05 };
   function bar() {
     let b = $('#approach'); if (b || !cs) return b;
     b = el('div', 'approach'); b.id = 'approach'; b.innerHTML = '<span>РАССТОЯНИЕ <b id="apDist">6.0 м</b></span><span>ВЫБЕРИ ДЕЙСТВИЕ</span><i><b></b></i>';
     const p = cs.querySelector('.combat-panel'); (p || cs).insertBefore(b, (p || cs).children[1] || null); return b;
   }
   function reach(k, e, s) {
     e.dispatchEvent(new CustomEvent('rk:monster-reach', { bubbles: true, detail: { k } })); // повесьте здесь урон/ход существа
     B.classList.add('fx-hit'); setTimeout(() => B.classList.remove('fx-hit'), 320); sfx.hit();
     const log = $('#combatLog'); if (log && k === 'c') log.textContent = 'Ты замешкался. Оно уже рядом.';
     s.t0 = performance.now() - s.dur * .55;
   }
   setInterval(() => {
     [['c', cs], ['t', th]].forEach(([k, e]) => {
       if (!e) return; const o = isOpen(e); let s = AP[k];
       if (!o) { if (s) { e.style.setProperty('--ap', 0); e.removeAttribute('data-near'); delete AP[k] } return }
       if (!s) { s = AP[k] = { t0: performance.now(), dur: (11 - g * 4) * 1000, ls: 0 }; if (k === 'c') bar() }
       const now = performance.now(), p = Math.min(1, (now - s.t0) / s.dur);
       e.style.setProperty('--ap', p.toFixed(3)); p > .7 ? e.setAttribute('data-near', '') : e.removeAttribute('data-near');
       if (k === 'c') { const d = $('#apDist'); if (d) d.textContent = (6 - 5.5 * p).toFixed(1) + ' м' }
       if (now - s.ls > 1500 - p * 1000) { s.ls = now; sfx.steps(1, .05 + p * .25) }
       if (p >= 1) reach(k, e, s);
     });
   }, 100);
   cs && cs.addEventListener('click', ev => { // выбранное действие отбрасывает монстра назад
     const s = AP.c; if (s && ev.target.closest('.combat-actions button')) s.t0 = performance.now() - s.dur * Math.max(0, (performance.now() - s.t0) / s.dur - .35);
   });
   
   /* ---------- запуск ---------- */
   every(burst, 2500, 9000, () => g);
   every(shadow, 1800, 6000, () => u * (g ? 1 : .5));
   every(sil, 5000, 15000, () => g);
   every(eyes, 6000, 16000, () => g > .2 ? g : 0);
   every(face, 9000, 26000, () => g > .35 ? g : 0);
   every(() => voice(), 9000, 24000, () => g > .15 ? g : 0);
   every(think, 6000, 15000, () => u);
   every(invFx, 7000, 19000, () => g);
   every(fakeTarget, 9000, 24000, () => g > .25 ? g : 0);
   every(hudGlitch, 4000, 12000, () => g);
   every(snd, 5000, 14000, () => u);
   
   window.RkFx = { setSanity, burst, shadow, sil, eyes, face, voice, invFx, think, snd, fakeTarget, test: v => setSanity(v ?? 30) };