'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
export type NameLocale = 'ko' | 'en';

const subscribers = new Set<() => void>();

function subscribe(callback: () => void) {
  subscribers.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    subscribers.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function notify() {
  subscribers.forEach((callback) => callback());
}

function getTheme(): Theme {
  const stored = window.localStorage.getItem('g2-live-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getNameLocale(): NameLocale {
  return window.localStorage.getItem('g2-live-name-locale') === 'en' ? 'en' : 'ko';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

export function useDisplayPreferences(): {
  theme: Theme;
  nameLocale: NameLocale;
  setTheme: (theme: Theme) => void;
  setNameLocale: (locale: NameLocale) => void;
} {
  const theme = useSyncExternalStore<Theme>(subscribe, getTheme, (): Theme => 'light');
  const nameLocale = useSyncExternalStore<NameLocale>(subscribe, getNameLocale, (): NameLocale => 'ko');

  useEffect(() => applyTheme(theme), [theme]);

  const setTheme = useCallback((next: Theme) => {
    window.localStorage.setItem('g2-live-theme', next);
    applyTheme(next);
    notify();
  }, []);

  const setNameLocale = useCallback((next: NameLocale) => {
    window.localStorage.setItem('g2-live-name-locale', next);
    notify();
  }, []);

  return { theme, nameLocale, setTheme, setNameLocale };
}
