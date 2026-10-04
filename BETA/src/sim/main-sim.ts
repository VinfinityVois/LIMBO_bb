import { RyokanScene } from './sim/scenes/RyokanScene';
import { bindAudioUnlock } from './core/audio';
import { simAudio } from './sim/audio/SimAudio';

bindAudioUnlock();

function boot() {
  const once = () => simAudio.unlock();
  window.addEventListener('pointerdown', once, { once: true });
  window.addEventListener('keydown', once, { once: true });

  const scene = new RyokanScene();
  scene.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
