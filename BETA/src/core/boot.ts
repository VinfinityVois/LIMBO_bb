export function bootPage(name: string): void {
    document.documentElement.dataset.page = name;
    console.info(`[LIMBO] boot · ${name}`);
  }