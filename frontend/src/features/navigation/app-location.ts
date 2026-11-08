import { useLayoutEffect, useMemo, useSyncExternalStore, type MouseEvent } from 'react'

export const homeHref = import.meta.env.BASE_URL
export const mySetsHref = `${homeHref}my-sets`
export const createSetHref = `${mySetsHref}/new`
const notFoundHref = `${homeHref}404`
const navigationEvent = 'janeq:navigate'

type SetMode = 'learn' | 'test' | 'editor'
type SetRoute = { kind: 'set'; id: string; mode: 'overview' | SetMode }

function readSetRoute(path: string, legacy = false): SetRoute | null {
  const pattern = /^([^/]+)(?:\/(learn|test|editor))?\/?$/
  const [, segment, mode] = pattern.exec(path) ?? []
  if (!segment) return null
  try {
    const id = decodeURIComponent(segment)
    if (id === '.' || id === '..') return null
    const studyMode = mode === 'learn' || mode === 'test'
    return { kind: 'set', id, mode: studyMode || (mode === 'editor' && !legacy) ? mode : 'overview' }
  } catch {
    return null
  }
}

export function studySetHref(id: string, mode?: SetMode) {
  return `${homeHref}${encodeURIComponent(id)}${mode ? `/${mode}` : ''}`
}

function legacyPath() {
  const { pathname, hash } = window.location
  if (pathname !== homeHref && pathname !== `${homeHref}index.html`) return undefined
  if (hash === '#home') return homeHref
  const legacy = /^#(?:set|card)(?:\/(.*))?$/.exec(hash)
  if (!legacy) return undefined
  const set = readSetRoute(legacy[1] ?? '', true)
  return set ? studySetHref(set.id, set.mode === 'overview' ? undefined : set.mode) : notFoundHref
}

function getPath() {
  if (restoringPath) return restoringPath
  const path = window.location.pathname
  return legacyPath() ?? (path === `${homeHref}index.html` ? homeHref : path)
}

function replaceLegacyUrl() {
  const path = legacyPath()
  if (path) window.history.replaceState(window.history.state, '', `${path}${window.location.search}`)
}

export function replaceStudySetAlias(href: string) {
  const { pathname, search, hash } = window.location
  if (pathname === href) return
  window.history.replaceState(window.history.state, '', `${href}${search}${hash}`)
  window.dispatchEvent(new Event(navigationEvent))
}

type NavigationGuard = (proceed: () => void) => void
let navigationGuard: NavigationGuard | undefined
let restoringPath: string | undefined
const positionKey = 'janeqLibraryPosition'

export function guardLibraryNavigation(guard: NavigationGuard) {
  navigationGuard = guard
  return () => { if (navigationGuard === guard) navigationGuard = undefined }
}

export function requestLibraryNavigation(proceed: () => void) {
  if (navigationGuard) navigationGuard(proceed)
  else proceed()
}

function historyPosition(): number | undefined {
  return window.history.state?.[positionKey]
}

function subscribe(onChange: () => void) {
  let position = historyPosition() ?? 0
  let path = getPath()
  let resumeTraversal: (() => void) | undefined
  let allowedPosition: number | undefined

  function updateLocation() {
    if (restoringPath) return
    replaceLegacyUrl()
    position = historyPosition() ?? position + 1
    window.history.replaceState({ ...window.history.state, [positionKey]: position }, '')
    path = getPath()
    onChange()
  }

  function traverse() {
    const next = historyPosition()
    if (restoringPath) {
      if (next !== position) {
        if (next !== undefined) window.history.go(position - next)
        return
      }
      restoringPath = undefined
      const resume = resumeTraversal
      resumeTraversal = undefined
      if (resume) requestLibraryNavigation(resume)
    } else if (navigationGuard && next !== undefined && next !== position && next !== allowedPosition && getPath() !== path) {
      // A popstate has already moved the browser. Restore its entry before asking whether to leave.
      restoringPath = path
      resumeTraversal = () => {
        allowedPosition = next
        window.history.go(next - position)
      }
      window.history.go(position - next)
      return
    }
    allowedPosition = undefined
    updateLocation()
  }

  window.history.replaceState({ ...window.history.state, [positionKey]: position }, '')
  window.addEventListener('popstate', traverse)
  window.addEventListener('hashchange', updateLocation)
  window.addEventListener(navigationEvent, updateLocation)
  return () => {
    restoringPath = undefined
    window.removeEventListener('popstate', traverse)
    window.removeEventListener('hashchange', updateLocation)
    window.removeEventListener(navigationEvent, updateLocation)
  }
}

function readRoute(path: string) {
  if (path === homeHref) return { kind: 'home' as const }
  if (path === mySetsHref || path === `${mySetsHref}/`) return { kind: 'my-sets' as const }
  if (path === createSetHref || path === `${createSetHref}/`) return { kind: 'create' as const }
  if (path === notFoundHref || path === `${notFoundHref}/`) return null
  return path.startsWith(homeHref) ? readSetRoute(path.slice(homeHref.length)) : null
}

export type LibraryRoute = NonNullable<ReturnType<typeof readRoute>>

export function useLibraryRoute() {
  const path = useSyncExternalStore(subscribe, getPath)
  useLayoutEffect(replaceLegacyUrl, [])
  return useMemo(() => readRoute(path), [path])
}

export function navigateLibrary(href: string) {
  const url = new URL(href, window.location.href)
  const samePath = url.pathname === window.location.pathname
  if (url.href !== window.location.href) {
    window.history.pushState({ [positionKey]: (historyPosition() ?? 0) + 1 }, '', url.href)
    window.dispatchEvent(new Event(navigationEvent))
  }
  if (samePath) window.scrollTo(0, 0)
}

export function followLibraryLink(event: MouseEvent<HTMLElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
  if (!link || !event.currentTarget.contains(link) || !link.getAttribute('href')?.startsWith(homeHref)
    || link.origin !== window.location.origin || (link.target && link.target !== '_self') || link.hasAttribute('download')
    || !readRoute(link.pathname)) return

  event.preventDefault()
  requestLibraryNavigation(() => navigateLibrary(link.href))
}
