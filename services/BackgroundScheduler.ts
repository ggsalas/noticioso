type Task = () => Promise<void>;

export class BackgroundScheduler {
  private queue: Task[] = [];
  private running = 0;
  private maxConcurrent = 3;
  private stopped = false;

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  add(task: Task) {
    this.queue.push(task);
    this.run();
  }

  addMany(tasks: Task[]) {
    this.queue.push(...tasks);
    this.run();
  }

  stop() {
    this.stopped = true;
  }

  private async run() {
    if (this.stopped) return;

    while (this.running < this.maxConcurrent && this.queue.length) {
      const task = this.queue.shift()!;
      this.running++;

      this.execute(task);
    }
  }

  private async execute(task: Task) {
    try {
      await task();
    } catch (e) {
      console.error("task failed", e);
    }

    this.running--;

    // ceder el thread a la UI
    await new Promise((r) => setTimeout(r, 0));

    this.run();
  }
}

export const backgroundScheduler = new BackgroundScheduler(3);
