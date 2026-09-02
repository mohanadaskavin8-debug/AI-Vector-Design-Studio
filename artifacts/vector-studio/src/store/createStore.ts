import { useSyncExternalStore } from 'react';

export function createStore<T>(initialState: T) {
  let state = initialState;
  const listeners = new Set<() => void>();

  const get = () => state;

  const set = (partial: Partial<T> | ((state: T) => Partial<T>)) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    if (nextState !== state) {
      state = { ...state, ...nextState };
      listeners.forEach((l) => l());
    }
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const useStore = <U>(selector: (state: T) => U = (s) => s as unknown as U): U => {
    return useSyncExternalStore(subscribe, () => selector(state));
  };

  return { get, set, subscribe, useStore };
}
