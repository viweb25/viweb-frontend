import { useSyncExternalStore } from 'react';

const NAVIGATION = 'vision-studio:navigate';
const appPath = /^\/(?:$|(?:projects|guide|programs|operator|results|inspect|team|modules)(?:\/|$))/;
const authPath = /^\/(?:login|signup|forgot|reset|invite)\/?$/;
const accountToken = /^[A-Za-z0-9_-]{43}$/;

function currentLocation() {
  return window.location.pathname + window.location.search;
}

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener(NAVIGATION, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(NAVIGATION, listener);
  };
}

export function useLocation() {
  return useSyncExternalStore(subscribe, currentLocation);
}

export function safeReturnTo(value: string | null) {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  const target = new URL(value, window.location.origin);
  return target.origin === window.location.origin && appPath.test(target.pathname)
    ? target.pathname + target.search : '/';
}

export function authHref(mode: 'login' | 'signup' | 'forgot', next: string | null = null) {
  const target = safeReturnTo(next);
  return target === '/' ? `/${mode}` : `/${mode}?${new URLSearchParams({ next: target })}`;
}

export function navigate(href: string, replace = false) {
  if (href !== currentLocation() || window.location.hash) {
    if (replace) window.history.replaceState(null, '', href);
    else window.history.pushState(null, '', href);
    window.dispatchEvent(new Event(NAVIGATION));
  }
}

export function useAccountToken(action: 'reset' | 'invite' | null) {
  return useSyncExternalStore(subscribe, () => {
    const link = window.history.state?.accountLink;
    return action && link?.action === action ? link.token as string : undefined;
  });
}

export function clearAccountToken() {
  window.history.replaceState(null, '', currentLocation());
}

function saveAccountToken(action: string, token: string) {
  window.history.replaceState({ accountLink: { action, token } }, '', `/${action}`);
  window.dispatchEvent(new Event(NAVIGATION));
}

function normalizeLegacyLocation() {
  const hash = window.location.hash.slice(1);
  const accountMatch = /^(reset|invite)\/([A-Za-z0-9_-]{43})$/.exec(hash);
  const cleanAccount = /^\/(reset|invite)\/?$/.exec(window.location.pathname);
  if (accountMatch && window.location.pathname === '/') {
    saveAccountToken(accountMatch[1], accountMatch[2]);
  } else if (cleanAccount && accountToken.test(hash)) {
    saveAccountToken(cleanAccount[1], hash);
  } else if (window.location.pathname === '/' && /^(login|signup|forgot)$/.test(hash)) {
    navigate(`/${hash}`, true);
  } else if (window.location.pathname === '/' && hash.startsWith('/')) {
    const target = safeReturnTo(hash);
    if (target !== '/' || hash === '/') navigate(target, true);
  }
}

export function installNavigation() {
  normalizeLegacyLocation();
  window.addEventListener('hashchange', normalizeLegacyLocation);
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin || url.hash || !(appPath.test(url.pathname) || authPath.test(url.pathname))) return;
    event.preventDefault();
    navigate(url.pathname + url.search);
  });
}
