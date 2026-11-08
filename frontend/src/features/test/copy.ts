export function draftTestMessage(remaining: number) {
  if (remaining === 0) return 'Add at least one configured question to start a test.'
  return remaining === 1
    ? '1 question still needs configuration before you can start a test.'
    : `${remaining} questions still need configuration before you can start a test.`
}
