export interface PromiseResolvers<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

/** Node 18-compatible equivalent of Promise.withResolvers. */
export function withResolvers<T>(): PromiseResolvers<T> {
  let resolve!: PromiseResolvers<T>['resolve'];
  let reject!: PromiseResolvers<T>['reject'];
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}
