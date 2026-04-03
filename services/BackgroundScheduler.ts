type Task = () => Promise<void>;

export class BackgroundScheduler {
  private queue: Task[] = [];
  private running = 0;
  private maxConcurrent = 1;
  private stopped = false;

  constructor(maxConcurrent = 1) {
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

    // Execute a chunk of tasks up to maxConcurrent
    const chunk: Task[] = [];
    while (this.running < this.maxConcurrent && this.queue.length) {
      chunk.push(this.queue.shift()!);
    }

    if (chunk.length === 0) return;

    this.running += chunk.length;

    // Execute all tasks in the chunk in parallel
    await Promise.all(chunk.map((task) => this.executeTask(task)));

    this.running -= chunk.length;

    // 🔑 Cede el control a la UI después de cada chunk
    await new Promise((r) => setTimeout(r, 0));

    // Process next chunk
    this.run();
  }

  private async executeTask(task: Task) {
    try {
      await task();
    } catch (e) {
      console.error("task failed", e);
    }
  }
}

export const backgroundScheduler = new BackgroundScheduler(1);
