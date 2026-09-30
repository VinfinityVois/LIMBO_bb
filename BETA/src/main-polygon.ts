/**
 * Полигон — NetworkCore + HUD (топологии / узел / latency)
 * createCore (hero+field) здесь не используем: один renderer на #webgl-root.
 */
import { bootPage } from './core/boot';
import { getProgress, isSceneDone, countDone } from './core/progress';
import { bindAudioUnlock, bindSfxUi, bindMuteToggle, sfx } from './core/audio';
import { bindReveals } from './ui/reveal';
import { createNetwork, TOPOS, type NodeInfo } from './webgl/NetworkCore';

bootPage('polygon');
bindReveals();
bindAudioUnlock();
bindSfxUi();
bindMuteToggle();

const progress = getProgress();
const done = countDone();

const statScenes = document.getElementById('statScenes');
if (statScenes) statScenes.textContent = `${done} / 3`;
const statScenes2 = document.getElementById('statScenes2');
if (statScenes2) statScenes2.textContent = `${done}/3`;

const stMap: [string, number][] = [
  ['st1', 1],
  ['st2', 2],
  ['st3', 3],
];
for (const [id, scene] of stMap) {
  const el = document.getElementById(id);
  if (!el) continue;
  if (isSceneDone(scene)) {
    el.textContent = '● ПРОЙДЕНА';
    el.className = 'st ok';
  } else if (scene === 1 || progress >= scene - 1) {
    el.textContent = '● ДОСТУПНА';
    el.className = 'st ok';
  } else {
    el.textContent = `● ТРЕБУЕТ 0${scene - 1}`;
    el.className = 'st lock';
  }
}

document.querySelectorAll<HTMLAnchorElement>('.scene-prev[data-need]').forEach((a) => {
  const need = parseInt(a.getAttribute('data-need') || '0', 10);
  if (progress < need) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      sfx.init();
      sfx.lock();
      a.style.boxShadow = '0 0 0 1px rgba(224,40,72,0.55)';
      setTimeout(() => {
        a.style.boxShadow = '';
      }, 450);
    });
  }
});

/* ── NetworkCore ── */
const root = document.getElementById('webgl-root');
const net = root ? createNetwork(root) : null;

if (!net) {
  console.warn('[LIMBO] NetworkCore offline (mobile / reduced-motion / no root)');
} else {
  const elTopo = document.getElementById('netTopo');
  const elFps = document.getElementById('netFps');
  const elNodes = document.getElementById('netNodes');
  const elEdges = document.getElementById('netEdges');
  const elPkt = document.getElementById('netPkt');
  const elNodeId = document.getElementById('netNodeId');
  const elNodeIp = document.getElementById('netNodeIp');
  const elNodeRole = document.getElementById('netNodeRole');
  const elNodeDeg = document.getElementById('netNodeDeg');
  const elNodeLat = document.getElementById('netNodeLat');
  const elHint = document.getElementById('netHint');

  const topoBtns = document.querySelectorAll<HTMLButtonElement>('[data-set-topo]');

  const syncTopoButtons = (active: number | null) => {
    topoBtns.forEach((btn) => {
      const v = btn.getAttribute('data-set-topo');
      const isAuto = v === 'auto';
      const idx = isAuto ? null : parseInt(v || '0', 10);
      const on =
        (isAuto && active === null) ||
        (!isAuto && active !== null && idx === active);
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  let lockedTopo: number | null = null;
  syncTopoButtons(null);

  topoBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      sfx.init();
      sfx.click();
      const v = btn.getAttribute('data-set-topo');
      if (v === 'auto') {
        lockedTopo = null;
        net.setTopo(null);
      } else {
        lockedTopo = parseInt(v || '0', 10);
        net.setTopo(lockedTopo);
      }
      syncTopoButtons(lockedTopo);
      net.pulse();
    });
  });

  net.onHover((n: NodeInfo | null) => {
    if (!n) {
      if (elNodeId) elNodeId.textContent = '—';
      if (elNodeIp) elNodeIp.textContent = '—';
      if (elNodeRole) elNodeRole.textContent = '—';
      if (elNodeDeg) elNodeDeg.textContent = '—';
      if (elNodeLat) elNodeLat.textContent = '—';
      if (elHint) elHint.textContent = 'наведите на узел · клик = pulse';
      return;
    }
    if (elNodeId) elNodeId.textContent = String(n.id).padStart(3, '0');
    if (elNodeIp) elNodeIp.textContent = n.ip;
    if (elNodeRole) elNodeRole.textContent = n.role;
    if (elNodeDeg) elNodeDeg.textContent = String(n.deg);
    if (elNodeLat) elNodeLat.textContent = `${n.lat} ms`;
    if (elHint) elHint.textContent = `${n.role} · deg ${n.deg} · ${n.lat} ms`;
  });

  const tickStats = () => {
    const s = net.stats();
    if (elTopo) elTopo.textContent = s.topo;
    if (elFps) elFps.textContent = String(s.fps);
    if (elNodes) elNodes.textContent = String(s.nodes);
    if (elEdges) elEdges.textContent = String(s.edges);
    if (elPkt) elPkt.textContent = String(s.packets);
    if (lockedTopo === null) {
      const approx = Math.min(3, Math.round(s.s));
      topoBtns.forEach((btn) => {
        const v = btn.getAttribute('data-set-topo');
        if (v === 'auto') {
          btn.classList.add('is-on');
          return;
        }
        btn.classList.toggle('is-on', parseInt(v || '-1', 10) === approx);
      });
    }
    requestAnimationFrame(() => setTimeout(tickStats, 250));
  };
  tickStats();

  console.info('[LIMBO] NetworkCore online', TOPOS);
}

console.info('[LIMBO] polygon', { progress, done });