/**
 * Reads theme-backfill-proposal.json and writes theme values to Supabase.
 *
 * Run ONLY after reviewing (and optionally editing) theme-backfill-proposal.json.
 * Run:  npm run apply:themes
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import ws from 'ws'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing required env vars. Make sure .env.local is present.')
  process.exit(1)
}

interface Proposal {
  id: string
  account_name: string | null
  title: string | null
  proposed_theme: string
}

const BATCH_SIZE = 50

async function main() {
  const filePath = resolve(process.cwd(), 'theme-backfill-proposal.json')
  let proposals: Proposal[]
  try {
    proposals = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    console.error(`Could not read ${filePath}. Run npm run backfill:themes first.`)
    process.exit(1)
  }

  console.log(`Read ${proposals.length} proposals from theme-backfill-proposal.json`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    realtime: { transport: ws as any },
  })
  let updated = 0
  let failed  = 0

  // Process in batches
  for (let i = 0; i < proposals.length; i += BATCH_SIZE) {
    const batch = proposals.slice(i, i + BATCH_SIZE)
    process.stdout.write(`  Updating rows ${i + 1}–${Math.min(i + BATCH_SIZE, proposals.length)}… `)

    // Supabase doesn't support bulk update with different values per row,
    // so we upsert individual rows in parallel within each batch.
    const results = await Promise.all(
      batch.map(p =>
        supabase
          .from('proposals')
          .update({ theme: p.proposed_theme })
          .eq('id', p.id)
      )
    )

    const batchErrors = results.filter(r => r.error)
    updated += batch.length - batchErrors.length
    failed  += batchErrors.length

    if (batchErrors.length > 0) {
      console.log(`${batchErrors.length} error(s)`)
      for (const r of batchErrors) console.error('   ', r.error?.message)
    } else {
      console.log('ok')
    }
  }

  console.log(`\nDone. Updated: ${updated}  Failed: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
