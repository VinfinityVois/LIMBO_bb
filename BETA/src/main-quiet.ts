import { bootPage } from './core/boot';
import { isSceneDone, setSceneDone, type SceneId } from './core/progress';
import { bindAudioUnlock, sfx } from './core/audio';

bootPage('quiet');
bindAudioUnlock();

const SCENE_ID: SceneId = 3;

(window as unknown as { LIMBO: {
  sceneId: SceneId;
  isDone: () => boolean;
  markDone: () => void;
}}).LIMBO = {
  sceneId: SCENE_ID,
  isDone: () => isSceneDone(SCENE_ID),
  markDone: () => {
    setSceneDone(SCENE_ID);
    sfx.init();
    sfx.success();
  },
};

if (isSceneDone(SCENE_ID)) {
  window.dispatchEvent(
    new CustomEvent('limbo:scene-already-done', { detail: SCENE_ID })
  );
}