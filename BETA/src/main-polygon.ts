import { bootPage } from './core/boot';
import { getProgress, isSceneDone } from './core/progress';
import { bindAudioUnlock, bindSfxUi, bindMuteToggle } from './core/audio';
import { bindReveals } from './ui/reveal';
import { createCore } from './webgl/createCore';

bootPage('polygon');
bindReveals();
bindAudioUnlock();
bindSfxUi();
bindMuteToggle();

console.info('[LIMBO] polygon', getProgress(), {
  s1: isSceneDone(1),
  s2: isSceneDone(2),
  s3: isSceneDone(3),
});

const root = document.getElementById('webgl-root');
if (root) {
  createCore(root);
} else {
  console.warn('[LIMBO] #webgl-root missing in polygon.html');
}