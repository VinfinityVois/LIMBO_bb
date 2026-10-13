import { ImmersionScene } from './sim/scenes/ImmersionScene';

function boot() {
  const root = document.getElementById('simStage');
  if (!root) {
    console.error('[SIM] #simStage not found');
    return;
  }
  const scene = new ImmersionScene();
  void scene.start().catch((e) => {
    console.error('[SIM]', e);
    const err = document.getElementById('stageError');
    if (err) {
      err.hidden = false;
      err.textContent = 'Ошибка: ' + String(e);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
