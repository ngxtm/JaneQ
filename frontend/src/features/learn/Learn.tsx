import { Button, Dialog, IconButton, Portal, VisuallyHidden } from '@chakra-ui/react'
import { IconArrowLeft, IconCheck, IconKeyframes, IconSettings, IconTrophy, IconX } from '@tabler/icons-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { PrimaryButton } from '../../ui/PrimaryButton'
import { SettingsSwitch } from '../../ui/SettingsSwitch'
import { studySetHref } from '../navigation/app-location'
import type { Feedback, LearnView, Question } from './api'
import { useLearn } from './use-learn'
import './learn.css'

function Progress({ value, total, label }: { value: number; total: number; label: string }) {
  return <div className="learn-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
    <span style={{ width: `${value / total * 100}%` }} />
  </div>
}

function StudyStats({ view }: { view: LearnView }) {
  return <dl className="learn-stats">
    <div><dt>Learning</dt><dd>{view.total_questions - view.familiar - view.mastered}</dd></div>
    <div><dt>Familiar</dt><dd>{view.familiar}</dd></div>
    <div><dt>Mastered</dt><dd>{view.mastered}</dd></div>
  </dl>
}

function RoundSummary({ view }: { view: LearnView }) {
  return <section className="learn-summary" aria-label="Round summary">
    <div className="learn-summary-progress">
      <h2>{view.studied} / {view.total_questions} <small>questions studied</small></h2>
      <Progress value={view.studied} total={view.total_questions} label="Questions studied" />
    </div>
    <StudyStats view={view} />
    <section aria-labelledby="round-review-title">
      <h2 id="round-review-title"><IconKeyframes size={19} /> Questions studied this round</h2>
      <ul className="learn-reviewed">
        {view.review.map((item) => <li key={item.id}>
          <span>{item.prompt}</span>
          <span className="learn-reviewed-answer">{item.answers.join(' · ')}</span>
          {item.correct ? <IconCheck aria-label="Correct" className="learn-positive" /> : <IconX aria-label="Incorrect" className="learn-negative" />}
        </li>)}
      </ul>
    </section>
  </section>
}

function QuestionCard({ view, question, feedback, busy, shortcuts, onAnswer }: {
  view: LearnView
  question: Question
  feedback: Feedback | null
  busy: boolean
  shortcuts: boolean
  onAnswer: (ids: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const disabled = busy || feedback !== null
  function choose(id: string) {
    if (disabled) return
    if (question.multiple) {
      setSelected((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])
    } else onAnswer([id])
  }
  const chooseShortcut = useEffectEvent(choose)

  useEffect(() => {
    if (!shortcuts || disabled) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || !/^[1-9]$/.test(event.key)) return
      const option = question.options[Number(event.key) - 1]
      if (option) chooseShortcut(option.id)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [disabled, question.options, shortcuts])

  return <section className="learn-question" aria-labelledby="learn-prompt">
    <Progress value={view.round_answered} total={view.round_size} label="Round progress" />
    <div className="learn-question-body">
      <p className="learn-eyebrow">Question {Math.min(view.round_size, view.round_answered + (feedback ? 0 : 1))} of {view.round_size}</p>
      <h2 id="learn-prompt">{question.prompt}</h2>
      <p className={feedback ? (feedback.correct ? 'learn-positive' : 'learn-negative') : 'learn-eyebrow'} aria-live="polite">
        {feedback ? (feedback.correct ? 'Correct' : 'Incorrect. Review the correct answer below.') : (question.multiple ? 'Select all correct answers' : 'Choose the correct answer')}
      </p>
      <div className="learn-options" role="group" aria-label="Answer choices">
        {question.options.map((option, index) => {
          const correct = feedback?.correct_ids.includes(option.id)
          const incorrect = feedback?.selected_ids.includes(option.id) && !correct
          const pressed = selected.includes(option.id)
          return <Button unstyled key={option.id} aria-disabled={disabled || undefined}
            aria-pressed={question.multiple ? (feedback?.selected_ids ?? selected).includes(option.id) : undefined}
            data-state={correct ? 'correct' : incorrect ? 'incorrect' : pressed && !feedback ? 'selected' : undefined}
            onClick={() => choose(option.id)}>
            <span className="learn-option-number" aria-hidden="true">
              {correct ? <IconCheck size={16} /> : incorrect ? <IconX size={16} /> : index + 1}
            </span>
            <span>{option.text}</span>
            {correct || incorrect ? <VisuallyHidden>{correct ? 'Correct answer' : 'Incorrect choice'}</VisuallyHidden> : null}
          </Button>
        })}
      </div>
      {question.multiple && !feedback ? (
        <PrimaryButton disabled={busy || !selected.length} onClick={() => onAnswer(selected)}>Check answer</PrimaryButton>
      ) : null}
    </div>
  </section>
}

export default function Learn({ setId, onSessionExpired }: { setId: string; onSessionExpired: () => void }) {
  const { view, loading, busy, error, notice, reload, send } = useLearn(setId, onSessionExpired)
  const [settings, setSettings] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const continueButton = useRef<HTMLButtonElement>(null)
  const backHref = studySetHref(setId)
  const feedbackCorrect = view?.feedback?.correct === true
  const activeQuestion = view?.question?.id
  const phase = view?.phase
  const showContinue = phase === 'summary' || (phase === 'feedback' && (!feedbackCorrect || !!error))
  const advance = useEffectEvent(() => { void send({ action: 'advance' }) })

  useEffect(() => {
    if (settings) return
    if (phase === 'feedback' && showContinue) continueButton.current?.focus({ preventScroll: true })
    else if (phase && phase !== 'feedback') heading.current?.focus({ preventScroll: true })
  }, [activeQuestion, phase, settings, showContinue])

  useEffect(() => {
    if (!feedbackCorrect || error || settings) return
    const timer = window.setTimeout(() => advance(), 1000)
    return () => window.clearTimeout(timer)
  }, [feedbackCorrect, error, settings, view?.version])

  useEffect(() => {
    if (!showContinue || settings || busy) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.repeat || (event.target instanceof HTMLElement && event.target.closest('button, a, input, select, textarea'))) return
      event.preventDefault()
      advance()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [busy, settings, showContinue])

  return <div className="learn-shell" aria-busy={loading || busy}>
    <header className="learn-titlebar">
      <IconButton asChild variant="ghost" className="learn-icon"><a href={backHref} aria-label="Back to study set"><IconArrowLeft /></a></IconButton>
      <h1 ref={heading} tabIndex={-1}>{phase === 'complete' ? 'Review' : view ? `Round ${view.round}` : 'Learn'}</h1>
      <IconButton aria-label="Settings" variant="ghost" className="learn-icon" disabled={!view} onClick={() => setSettings(true)}><IconSettings /></IconButton>
    </header>
    {loading ? <VisuallyHidden role="status">Loading Learn…</VisuallyHidden> : null}
    {notice && view ? <p className="learn-notice" role="status">{notice}</p> : null}
    {error ? <div className="learn-notice" role="alert">
      {error} {!view ? <Button variant="outline" size="sm" onClick={reload}>Try again</Button> : null}
    </div> : null}
    {view?.question ? <QuestionCard key={`${view.round}:${view.question.id}`} view={view} question={view.question}
      feedback={view.feedback} busy={busy} shortcuts={!settings} onAnswer={(ids) => { void send({ action: 'check', selected_ids: ids }) }} /> : null}
    {view && phase === 'summary' ? <RoundSummary view={view} /> : null}
    {view && phase === 'complete' ? <section className="learn-complete" aria-labelledby="learn-complete-title">
      <StudyStats view={view} />
      <IconTrophy size={56} className="learn-icon" aria-hidden="true" />
      <h2 id="learn-complete-title">You mastered every question!</h2>
      <p>All {view.total_questions} questions in this set are mastered.</p>
      <PrimaryButton asChild><a href={backHref}>Finish Learn</a></PrimaryButton>
      <Button variant="ghost" onClick={() => { setSettings(true); setConfirmReset(true) }}>Reset progress</Button>
    </section> : null}
    {showContinue ? <div className="learn-action-bar"><div>
      <span>Press Enter to continue</span>
      <PrimaryButton ref={continueButton} disabled={busy} onClick={() => { void send({ action: 'advance' }) }}>
        {phase === 'summary' ? `Continue to round ${(view?.round ?? 0) + 1}` : 'Continue'}
      </PrimaryButton>
    </div></div> : null}
    <Dialog.Root open={settings && !!view} onOpenChange={({ open }) => { setSettings(open); if (!open) setConfirmReset(false) }} placement="center">
      <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
        <Dialog.Header><Dialog.Title>{confirmReset ? 'Reset progress?' : 'Settings'}</Dialog.Title></Dialog.Header>
        <Dialog.Body>
          {error ? <p role="alert" className="learn-negative">{error}</p> : null}
          {confirmReset ? <p>This will start a new Learn session for this study set.</p> : (
            <SettingsSwitch label="Shuffle questions in future rounds" checked={view?.shuffle ?? false} disabled={busy}
              onCheckedChange={({ checked }) => { void send({ action: 'settings', shuffle: checked }) }} />
          )}
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.ActionTrigger asChild>
            {confirmReset ? <Button variant="outline">Cancel</Button> : <PrimaryButton>Done</PrimaryButton>}
          </Dialog.ActionTrigger>
          <Button variant={confirmReset ? 'solid' : 'outline'} colorPalette="red" disabled={busy} onClick={async () => {
            if (!confirmReset) setConfirmReset(true)
            else if (await send({ action: 'reset' })) { setConfirmReset(false); setSettings(false) }
          }}>Reset progress</Button>
        </Dialog.Footer>
      </Dialog.Content></Dialog.Positioner></Portal>
    </Dialog.Root>
  </div>
}
