import { useLayoutEffect, useMemo, useSyncExternalStore, type MouseEvent } from 'react'

export const homeHref = import.meta.env.BASE_URL
const navigationEvent = 'janeq:navigate'

type SetRoute = { kind: 'set'; id: string; mode: 'overview' | 'learn' | 'test' }

function readSetRoute(path: string, legacy = false): SetRoute | null {
  const pattern = legacy ? /^([^/]+)(?:\/(learn|test|editor))?$/ : /^([^/]+)(?:\/(learn|test))?\/?$/
  const [, segment, mode] = pattern.exec(path) ?? []
  if (!segment) return null
  try {
    const id = decodeURIComponent(segment)
    if (id === '.' || id === '..') return null
    return { kind: 'set', id, mode: mode === 'learn' || mode === 'test' ? mode : 'overview' }
  } catch {
    return null
  }
}

export function studySetHref(id: string, mode?: 'learn' | 'test') {
  return `${homeHref}${encodeURIComponent(id)}${mode ? `/${mode}` : ''}`
}

function legacyPath() {
  const { pathname, hash } = window.location
  if (pathname !== homeHref && pathname !== `${homeHref}index.html`) return undefined
  if (hash === '#home') return homeHref
  const [, path] = /^#(?:set|card)\/(.+)$/.exec(hash) ?? []
  const set = path && readSetRoute(path, true)
  if (set) return studySetHref(set.id, set.mode === 'overview' ? undefined : set.mode)
  return undefined
}

function getPath() {
  const path = window.location.pathname
  return legacyPath() ?? (path === `${homeHref}index.html` ? homeHref : path)
}

function replaceLegacyUrl() {
  const path = legacyPath()
  if (path) window.history.replaceState(window.history.state, '', `${path}${window.location.search}`)
}

function subscribe(onChange: () => void) {
  function updateLocation() {
    replaceLegacyUrl()
    onChange()
  }

  window.addEventListener('popstate', updateLocation)
  window.addEventListener('hashchange', updateLocation)
  window.addEventListener(navigationEvent, updateLocation)
  return () => {
    window.removeEventListener('popstate', updateLocation)
    window.removeEventListener('hashchange', updateLocation)
    window.removeEventListener(navigationEvent, updateLocation)
  }
}

function readRoute(path: string) {
  if (path === homeHref) return { kind: 'home' as const }
  return path.startsWith(homeHref) ? readSetRoute(path.slice(homeHref.length)) : null
}

export type LibraryRoute = NonNullable<ReturnType<typeof readRoute>>

export function useLibraryRoute() {
  const path = useSyncExternalStore(subscribe, getPath)
  useLayoutEffect(replaceLegacyUrl, [])
  return useMemo(() => readRoute(path), [path])
}

export function followLibraryLink(event: MouseEvent<HTMLElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
  if (!link || !event.currentTarget.contains(link) || !link.getAttribute('href')?.startsWith(homeHref)
    || link.origin !== window.location.origin || (link.target && link.target !== '_self') || link.hasAttribute('download')
    || !readRoute(link.pathname)) return

  event.preventDefault()
  const samePath = link.pathname === window.location.pathname
  if (link.href !== window.location.href) {
    window.history.pushState(null, '', link.href)
    window.dispatchEvent(new Event(navigationEvent))
  }
  if (samePath) window.scrollTo(0, 0)
}
