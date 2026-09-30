import { bootPage } from './core/boot';
import {
  getProgress,
  isSceneDone,
  isSceneUnlocked,
  resetProgress,
  onProgress,
  SCENE_META,
  type SceneId,
} from './core/progress';
import { bindAudioUnlock, bindSfxUi, sfx } from './core/audio';
import { bindReveals } from './ui/reveal';

bootPage('scenes');
bindAudioUnlock();
bindSfxUi();
bindReveals();

function syncSceneCards(): void {
  for (let id = 1; id <= 3; id++) {
    const sid = id as SceneId;
    const card = document.querySelector(`[data-scene="${id}"]`);
    if (!card) continue;
    const done = isSceneDone(sid);
    const unlocked = isSceneUnlocked(sid);
    card.classList.toggle('is-done', done);
    card.classList.toggle('is-locked', !unlocked);
    card.classList.toggle('is-open', unlocked && !done);
  }
  const fill = document.getElementById('progressFill');
  if (fill) fill.style.width = (getProgress() / 3) * 100 + '%';
}

syncSceneCards();
onProgress(() => syncSceneCards());

document.querySelectorAll<HTMLAnchorElement>('[data-scene]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = parseInt(a.getAttribute('data-scene') || '0', 10) as SceneId;
    if (!isSceneUnlocked(id)) {
      e.preventDefault();
      sfx.init();
      sfx.lock();
    }
  });
});

const btn = document.getElementById('resetProgress');
if (btn) {
  btn.addEventListener('click', () => {
    resetProgress();
    sfx.init();
    sfx.glitch();
    location.reload();
  });
}

console.info('[LIMBO] scenes', getProgress(), SCENE_META);