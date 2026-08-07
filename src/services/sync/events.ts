/**
 * Tiny typed event bus for the sync engine.
 *
 * Repos emit a "queue change" event whenever they enqueue an operation, and the
 * Realtime service emits a "remote change" event whenever the cloud reports a
 * new row change; the sync engine subscribes to both and schedules a debounced
 * sync. Keeping the bus here (a leaf module) avoids circular imports between
 * repos, the Realtime service, and the engine.
 */

type ChangeListener = () => void;

let queueListeners: ChangeListener[] = [];
let remoteListeners: ChangeListener[] = [];

function subscribe(list: ChangeListener[], listener: ChangeListener): () => void {
  list.push(listener);
  return () => {
    const index = list.indexOf(listener);
    if (index !== -1) {
      list.splice(index, 1);
    }
  };
}

function emit(list: ChangeListener[]): void {
  for (const listener of [...list]) {
    listener();
  }
}

/** Subscribes to queue-change events; returns an unsubscribe function. */
export function onQueueChange(listener: ChangeListener): () => void {
  return subscribe(queueListeners, listener);
}

/** Notifies subscribers that a change was queued for upload. */
export function emitQueueChange(): void {
  emit(queueListeners);
}

/** Subscribes to remote-change events (live sync signals); returns an unsubscribe function. */
export function onRemoteChange(listener: ChangeListener): () => void {
  return subscribe(remoteListeners, listener);
}

/** Notifies subscribers that the cloud reported a change needing a pull. */
export function emitRemoteChange(): void {
  emit(remoteListeners);
}
