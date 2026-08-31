export interface Suggestion<T> {
  option: T
  score: number
}

export function normalize(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function similarity(source: string | null | undefined, candidate: string | null | undefined) {
  const left = normalize(source)
  const right = normalize(candidate)
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.88

  const leftTokens = new Set(left.split(' '))
  const rightTokens = new Set(right.split(' '))
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  return union ? intersection / union : 0
}

export function bestSuggestion<T>(
  source: string | null | undefined,
  options: T[],
  label: (option: T) => string,
  minimumScore = 0.34
): Suggestion<T> | null {
  let best: Suggestion<T> | null = null

  for (const option of options) {
    const score = similarity(source, label(option))
    if (score >= minimumScore && (!best || score > best.score)) {
      best = { option, score }
    }
  }

  return best
}
