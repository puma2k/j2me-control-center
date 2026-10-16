/** Tracks user activity only; frame updates and status polling never reset idle time. */
export class ScreenIdleTimer {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private held = new Set<string>();
  sleeping = false;
  constructor(
    private change: (sleeping: boolean) => void,
    private delay = 30000,
  ) {
    this.activity();
  }
  activity() {
    const wasSleeping = this.sleeping;
    this.sleeping = false;
    if (wasSleeping) this.change(false);
    clearTimeout(this.timer);
    if (!this.held.size)
      this.timer = setTimeout(() => {
        this.sleeping = true;
        this.change(true);
      }, this.delay);
    return wasSleeping;
  }
  hold(key: string) {
    this.held.add(key);
    this.activity();
  }
  release(key: string) {
    this.held.delete(key);
    this.activity();
  }
  releaseAll() {
    this.held.clear();
    if (!this.sleeping) this.activity();
  }
  dispose() {
    clearTimeout(this.timer);
  }
}
