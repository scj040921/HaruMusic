/** Bounded fallback: give the preferred source a head start, never wait for a
 * slow source before accepting another enabled source's valid result. */
export function firstAvailable<T>(
  tasks: Array<() => Promise<T | null>>,
  delay = 350
): Promise<T | null> {
  return new Promise((resolve) => {
    let next = 0,
      active = 0,
      done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: T | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const arm = () => {
      if (!done && next < tasks.length && active < 2 && !timer)
        timer = setTimeout(() => {
          timer = undefined;
          launch();
        }, delay);
    };
    const launch = () => {
      if (done || active >= 2) return;
      if (next >= tasks.length) {
        if (!active) finish(null);
        return;
      }
      active++;
      Promise.resolve()
        .then(tasks[next++])
        .catch(() => null)
        .then((value) => {
          active--;
          if (done) return;
          if (value !== null) {
            finish(value);
            return;
          }
          launch();
          arm();
        });
      arm();
    };
    launch();
  });
}
