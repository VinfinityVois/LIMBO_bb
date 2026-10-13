/** Alias bootstrap — entry from /src/sim/ if needed */
import { ImmersionScene } from './scenes/ImmersionScene';

export async function bootSim(): Promise<void> {
  const scene = new ImmersionScene();
  await scene.start();
}

if (typeof document !== 'undefined') {
  const run = () => bootSim().catch((e) => console.error('[SIM]', e));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}
