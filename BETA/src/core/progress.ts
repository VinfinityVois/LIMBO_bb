export const PROGRESS_KEY = 'limbo_scene_progress';
export type SceneId = 1 | 2 | 3;

export interface ProgressSnapshot {
  progress: number;
  done: [boolean, boolean, boolean];
  unlocked: [boolean, boolean, boolean];
}

function clampProgress(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, Math.floor(n)));
}

export function getProgress(): number {
  return clampProgress(parseInt(localStorage.getItem(PROGRESS_KEY) || '0', 10));
}

export function isSceneUnlocked(id: SceneId): boolean {
  if (id === 1) return true;
  return getProgress() >= id - 1 || isSceneDone((id - 1) as SceneId);
}

export function isSceneDone(id: SceneId | number): boolean {
  if (localStorage.getItem(`${PROGRESS_KEY}_done_${id}`) === '1') return true;
  return getProgress() >= id;
}

export function setSceneDone(id: SceneId): void {
  if (getProgress() < id) localStorage.setItem(PROGRESS_KEY, String(id));
  localStorage.setItem(`${PROGRESS_KEY}_done_${id}`, '1');
  emit();
}

export function countDone(): number {
  let n = 0;
  for (let i = 1; i <= 3; i++) if (isSceneDone(i)) n++;
  return n;
}

export function getSnapshot(): ProgressSnapshot {
  return {
    progress: getProgress(),
    done: [isSceneDone(1), isSceneDone(2), isSceneDone(3)],
    unlocked: [isSceneUnlocked(1), isSceneUnlocked(2), isSceneUnlocked(3)],
  };
}

export function resetProgress(): void {
  localStorage.removeItem(PROGRESS_KEY);
  for (let i = 1; i <= 3; i++) localStorage.removeItem(`${PROGRESS_KEY}_done_${i}`);
  emit();
}

function emit(): void {
  try {
    window.dispatchEvent(
      new CustomEvent<ProgressSnapshot>('limbo:progress', { detail: getSnapshot() })
    );
  } catch { /* */ }
}

export function onProgress(handler: (s: ProgressSnapshot) => void): () => void {
  const fn = (e: Event) => handler((e as CustomEvent<ProgressSnapshot>).detail);
  window.addEventListener('limbo:progress', fn);
  return () => window.removeEventListener('limbo:progress', fn);
}

export function debugProgress(): void {
  console.table(getSnapshot());
}

export const SCENE_META: Record<SceneId, { slug: string; title: string; href: string }> = {
  1: { slug: 'ryokan', title: 'Рёкан', href: 'scene-ryokan.html' },
  2: { slug: 'shanghai', title: 'Шанхай', href: 'scene-shanghai.html' },
  3: { slug: 'quiet', title: 'Тихое место', href: 'scene-quiet.html' },
};