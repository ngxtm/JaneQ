import { useEffect, useState } from 'react'
import { getStudySets, isUnauthorized, type StudySet } from './api'

type StudySetsState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; sets: StudySet[] }

function StudySetGrid({ sets }: { sets: StudySet[] }) {
  return (
    <ul className="set-grid">
      {sets.map((set) => (
        <li className="set-card" key={set.id}>
          <div className="card-top">
            <p className="question-count">{set.question_count} {set.question_count === 1 ? 'question' : 'questions'}</p>
            <span className={`badge badge-${set.status}`}>{set.status === 'ready' ? 'Ready' : 'Draft'}</span>
          </div>
          <h3>{set.title}</h3>
          <p className="muted">{set.configured_count} of {set.question_count} answer keys set</p>
        </li>
      ))}
    </ul>
  )
}

export default function Home({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [state, setState] = useState<StudySetsState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getStudySets(controller.signal).then((sets) => {
      if (!controller.signal.aborted) setState({ kind: 'loaded', sets })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (isUnauthorized(error)) {
        onSessionExpired()
        return
      }
      setState({ kind: 'error' })
    })
    return () => controller.abort()
  }, [attempt, onSessionExpired])

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((current) => current + 1)
  }

  const builtInSets = state.kind === 'loaded' ? state.sets.filter((set) => set.source_kind === 'builtin') : []
  const mySets = state.kind === 'loaded' ? state.sets.filter((set) => set.source_kind === 'custom') : []

  return (
    <main className="page home-page">
      <div className="home-intro">
        <h1>Your study sets</h1>
        <p className="muted">Browse your question library and see which sets are ready to practice.</p>
      </div>
      <section aria-labelledby="builtin-title">
        <h2 id="builtin-title">Built-in sets</h2>
        {state.kind === 'loading' ? <p role="status">Loading study sets…</p> : null}
        {state.kind === 'error' ? (
          <div className="retry-panel">
            <p className="error" role="alert">Could not load study sets.</p>
            <button type="button" onClick={retry}>Try again</button>
          </div>
        ) : null}
        {state.kind === 'loaded' ? (
          builtInSets.length ? <StudySetGrid sets={builtInSets} /> : <p>No built-in sets are available.</p>
        ) : null}
      </section>
      {mySets.length > 0 ? (
        <section aria-labelledby="my-sets-title">
          <h2 id="my-sets-title">My sets</h2>
          <StudySetGrid sets={mySets} />
        </section>
      ) : null}
    </main>
  )
}
