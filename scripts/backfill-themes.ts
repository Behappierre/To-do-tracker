/**
 * Proposes theme labels for all proposals where theme IS NULL.
 *
 * Groups rows by account_name and sends each account's rows to Claude in a
 * single prompt so it can assign *consistent* theme labels within that account.
 *
 * Output:
 *   - theme-backfill-proposal.json  (do not apply — review first)
 *   - terminal summary grouped by account → theme → titles
 *
 * Run:  npm run backfill:themes
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { resolve } from 'path'
import ws from 'ws'

// ── env (loaded by tsx --env-file=.env.local) ───────────────────────────────
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Missing required env vars. Make sure .env.local is present.')
  process.exit(1)
}

// ── types ────────────────────────────────────────────────────────────────────
interface Row {
  id: string
  account_name: string | null
  title: string | null
  summary: string | null
  dependencies: string | null
}

interface Proposal {
  id: string
  account_name: string | null
  title: string | null
  proposed_theme: string
}

interface ClaudeRowResult {
  id: string
  theme: string
}

// ── clients ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase  = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  realtime: { transport: ws as any },
})
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Calls Claude to assign a theme label to each row in a single-account batch.
 * Returns a map of id → theme string.
 */
async function proposeThemesForAccount(
  accountName: string | null,
  rows: Row[],
): Promise<Map<string, string>> {
  const accountLabel = accountName ?? '(no account)'

  const rowsJson = JSON.stringify(
    rows.map(r => ({
      id: r.id,
      title: r.title ?? '',
      summary: r.summary ?? '',
      dependencies: r.dependencies ?? '',
    })),
    null,
    2,
  )

  const prompt = `You are helping to categorise BD action items for a rail/transport tech consultancy.

Account: ${accountLabel}

Below are ${rows.length} action item(s) from this account that need a theme label.

A "theme" is a short 2-4 word phrase (e.g. "TPF Funding", "Crew Rostering Pilot", "TOPS/POIS Procurement", "Discovery Use Case", "Tom Grant Unlock") that names the **underlying business thread or opportunity** this action belongs to.

Rules:
1. Actions describing the **same underlying thread** MUST get the **identical theme string** (exact match) so they group together correctly later.
2. If an action is a one-off relationship/admin item with no clear ongoing thread (e.g. "Thank you for AI Rail Plan inclusion", "Rail Sector Catch Up"), use "General / Relationship".
3. If the account itself is unknown/null or the action is purely administrative housekeeping, use "Admin".
4. Keep themes short (2-4 words). Capitalise each word. No punctuation except "/" where helpful.
5. Look across ALL rows for this account before assigning labels — spot the clusters first, then label.

Return ONLY a valid JSON array in this exact shape, with no preamble or markdown fences:
[
  { "id": "<uuid>", "theme": "<theme label>" },
  ...
]

Action items:
${rowsJson}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0]
  if (raw.type !== 'text') throw new Error('Unexpected non-text response from Claude')

  let parsed: ClaudeRowResult[]
  try {
    const cleaned = raw.text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Failed to parse Claude JSON for account "${accountLabel}":\n${raw.text}`)
  }

  const map = new Map<string, string>()
  for (const item of parsed) {
    map.set(item.id, item.theme)
  }
  return map
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching rows where theme IS NULL…')

  const { data, error } = await supabase
    .from('proposals')
    .select('id, account_name, title, summary, dependencies')
    .is('theme', null)
    .order('account_name', { ascending: true })

  if (error) {
    console.error('Supabase error:', error.message)
    process.exit(1)
  }

  const rows = (data ?? []) as Row[]
  console.log(`Found ${rows.length} row(s) needing theme labels.`)

  if (rows.length === 0) {
    console.log('Nothing to do.')
    process.exit(0)
  }

  // Group by account_name (null accounts go in their own bucket)
  const byAccount = new Map<string | null, Row[]>()
  for (const row of rows) {
    const key = row.account_name ?? null
    if (!byAccount.has(key)) byAccount.set(key, [])
    byAccount.get(key)!.push(row)
  }

  console.log(`\nProcessing ${byAccount.size} account group(s)…\n`)

  const proposals: Proposal[] = []

  for (const [account, accountRows] of byAccount) {
    const label = account ?? '(no account)'
    process.stdout.write(`  ${label} (${accountRows.length} rows)… `)

    try {
      const themeMap = await proposeThemesForAccount(account, accountRows)

      for (const row of accountRows) {
        const proposed_theme = themeMap.get(row.id) ?? 'General / Relationship'
        proposals.push({
          id: row.id,
          account_name: row.account_name,
          title: row.title,
          proposed_theme,
        })
      }
      console.log('done')
    } catch (err) {
      console.log('ERROR')
      console.error(`    ${err instanceof Error ? err.message : String(err)}`)
      // Still emit rows with a fallback theme so the file is complete
      for (const row of accountRows) {
        proposals.push({
          id: row.id,
          account_name: row.account_name,
          title: row.title,
          proposed_theme: 'UNCLASSIFIED — review manually',
        })
      }
    }
  }

  // ── write JSON ──────────────────────────────────────────────────────────────
  const outputPath = resolve(process.cwd(), 'theme-backfill-proposal.json')
  writeFileSync(outputPath, JSON.stringify(proposals, null, 2), 'utf8')
  console.log(`\nWrote ${proposals.length} proposals → ${outputPath}`)

  // ── terminal summary ────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(72))
  console.log('PROPOSED THEME GROUPINGS — review before applying')
  console.log('═'.repeat(72))

  // Group summary: account → theme → titles
  const summary = new Map<string, Map<string, string[]>>()
  for (const p of proposals) {
    const acct = p.account_name ?? '(no account)'
    if (!summary.has(acct)) summary.set(acct, new Map())
    const themes = summary.get(acct)!
    if (!themes.has(p.proposed_theme)) themes.set(p.proposed_theme, [])
    themes.get(p.proposed_theme)!.push(p.title ?? '(no title)')
  }

  for (const [acct, themes] of [...summary].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`\n▶ ${acct}`)
    for (const [theme, titles] of [...themes].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`   ● ${theme}  (${titles.length})`)
      for (const t of titles) {
        console.log(`       – ${t}`)
      }
    }
  }

  console.log('\n' + '═'.repeat(72))
  console.log('Edit theme-backfill-proposal.json if needed, then run:')
  console.log('  npm run apply:themes')
  console.log('═'.repeat(72) + '\n')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
