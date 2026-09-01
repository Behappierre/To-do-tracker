import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthClient } from '@/lib/supabase-server'
import { getBusinessDevelopmentWorkspaceId } from '@/lib/workspace'

const BASE_SYSTEM_PROMPT = `You are a BD action tracker assistant. The input below is a meeting summary document from a rail/transport tech consultancy. Your task is to extract every discrete action item from the "Actions and Next Steps" section and return them as a JSON array.

For each action item, extract:
- title: concise 5-10 word description of the action (e.g. "Ross to email Graham White re TPF funding")
- account_name: client organisation name (infer from the meeting context header if not explicit in the action itself)
- contact_name: the named person responsible for this action (from the "Who" field)
- owner: "us" if the action owner is Netcompany / Olivier / our team; "them" if it is the client side. If mixed or unclear, default to "them" and flag it in notes
- source_date: meeting date in ISO format YYYY-MM-DD if stated in the document, otherwise null
- expected_by: the date or deadline from the "When" field. If a vague phrase is given (e.g. "early 2027", "a few weeks", "by end of Q1"), convert to a best-guess ISO date YYYY-MM-DD. If no timeframe given, set to null.
- expected_by_is_approximate: true if the "When" field was vague or estimated; false if an explicit date was stated; false if expected_by is null
- strategic_weight: map from the "Strategic weight" field to exactly one of: "Low", "Medium", "Medium-High", "High". If not stated, set to null.
- dependencies: text from the "Dependencies" field, or null
- summary: 1-2 sentence context drawn from the Substantive Summary section that is directly relevant to this action item
- status: always "Open"
- theme: a short topic label for this action. Reuse one of the existing themes listed below when the topic clearly matches; only invent a new short theme name when none fit. null if you can't tell.
- company_id: the canonical id of the company this action belongs to, copied EXACTLY from the "Known companies" list below — but ONLY when you are confident the account_name matches one of them. Otherwise null. Never invent an id that isn't in the list.
- primary_stakeholder_id: the canonical id of the contact_name, copied EXACTLY from the "Known stakeholders" list below — but ONLY when confident. Otherwise null. Never invent an id that isn't in the list.
- possible_continuation_of: if this action clearly continues or updates one of the "Currently open actions" listed below (same underlying ask, later stage of the same thread), copy its id EXACTLY. Otherwise null. Setting this does NOT mean you should skip extracting the action — always extract every action as its own row regardless.

Return ONLY a valid JSON object in this exact shape, with no preamble, explanation, or markdown fences:
{
  "actions": [
    {
      "title": "...",
      "account_name": "...",
      "contact_name": "...",
      "owner": "us" or "them",
      "source_date": "YYYY-MM-DD" or null,
      "expected_by": "YYYY-MM-DD" or null,
      "expected_by_is_approximate": true or false,
      "strategic_weight": "Low" | "Medium" | "Medium-High" | "High" | null,
      "dependencies": "..." or null,
      "summary": "...",
      "status": "Open",
      "theme": "..." or null,
      "company_id": "..." or null,
      "primary_stakeholder_id": "..." or null,
      "possible_continuation_of": "..." or null
    }
  ]
}

Rules:
- Extract EVERY action item — do not skip any.
- If a field cannot be confidently extracted, set it to null.
- Return nothing outside the JSON object.`

interface WorkspaceContext {
  companies: { id: string; name: string }[]
  stakeholders: { id: string; full_name: string; company_id: string | null }[]
  themes: string[]
  openActions: { id: string; title: string | null; account_name: string | null }[]
}

async function loadWorkspaceContext(inputText: string): Promise<WorkspaceContext | null> {
  try {
    const supabase = getAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return null

    const workspaceId = await getBusinessDevelopmentWorkspaceId(supabase)
    const lowerText = inputText.toLowerCase()

    const [companiesResult, stakeholdersResult, actionsResult] = await Promise.all([
      supabase.from('companies').select('id, name').eq('workspace_id', workspaceId).eq('status', 'active'),
      supabase.from('stakeholders').select('id, full_name, company_id').eq('workspace_id', workspaceId).eq('status', 'active'),
      supabase.from('proposals').select('id, title, account_name, theme')
        .eq('workspace_id', workspaceId)
        .is('archived_at', null)
        .neq('status', 'Done')
        .neq('status', 'Superseded'),
    ])

    // Only surface companies/stakeholders actually mentioned in this document —
    // keeps the bundle small and relevant instead of dumping the whole workspace in.
    const matchedCompanies = (companiesResult.data ?? []).filter(
      (c) => c.name && lowerText.includes(c.name.toLowerCase())
    )
    const matchedStakeholders = (stakeholdersResult.data ?? []).filter(
      (s) => s.full_name && lowerText.includes(s.full_name.toLowerCase())
    )
    const matchedCompanyNames = new Set(matchedCompanies.map((c) => c.name.toLowerCase()))

    const openActions = (actionsResult.data ?? [])
      .filter((a) => a.account_name && matchedCompanyNames.has(a.account_name.toLowerCase()))
      .map((a) => ({ id: a.id as string, title: a.title as string | null, account_name: a.account_name as string | null }))

    const themes = Array.from(
      new Set((actionsResult.data ?? []).map((a) => a.theme).filter((t): t is string => Boolean(t)))
    ).sort()

    return { companies: matchedCompanies, stakeholders: matchedStakeholders, themes, openActions }
  } catch (err) {
    console.error('loadWorkspaceContext error (extraction proceeds without it):', err)
    return null
  }
}

function buildContextBlock(context: WorkspaceContext | null): string {
  if (!context) {
    return '\n\nNo workspace context is available for this request — leave company_id, primary_stakeholder_id, and possible_continuation_of null for every action.'
  }

  const { companies, stakeholders, themes, openActions } = context
  const parts: string[] = []

  parts.push(
    companies.length
      ? `Known companies (use for company_id):\n${companies.map((c) => `- id: ${c.id}, name: "${c.name}"`).join('\n')}`
      : 'Known companies: none matched this document — leave company_id null for every action.'
  )

  parts.push(
    stakeholders.length
      ? `Known stakeholders (use for primary_stakeholder_id):\n${stakeholders.map((s) => `- id: ${s.id}, name: "${s.full_name}", company_id: ${s.company_id ?? 'null'}`).join('\n')}`
      : 'Known stakeholders: none matched this document — leave primary_stakeholder_id null for every action.'
  )

  parts.push(
    themes.length
      ? `Existing themes already used in this workspace (reuse when the topic matches):\n${themes.map((t) => `- "${t}"`).join('\n')}`
      : 'No existing themes recorded yet — pick a short descriptive one if the topic warrants it.'
  )

  parts.push(
    openActions.length
      ? `Currently open actions for these companies (use for possible_continuation_of):\n${openActions.map((a) => `- id: ${a.id}, title: "${a.title ?? 'Untitled'}" (${a.account_name})`).join('\n')}`
      : 'No currently open actions on these companies — leave possible_continuation_of null for every action.'
  )

  return `\n\n${parts.join('\n\n')}`
}

interface RawExtractedAction {
  title?: string | null
  account_name?: string | null
  contact_name?: string | null
  owner?: string | null
  source_date?: string | null
  expected_by?: string | null
  expected_by_is_approximate?: boolean | null
  strategic_weight?: string | null
  dependencies?: string | null
  summary?: string | null
  status?: string | null
  theme?: string | null
  company_id?: string | null
  primary_stakeholder_id?: string | null
  possible_continuation_of?: string | null
}

// The model's ids must be validated against the exact bundle we sent it —
// a hallucinated id that happens to look like a UUID is a real failure mode,
// never trust one that wasn't actually offered as an option.
function sanitizeExtractedActions(actions: RawExtractedAction[], context: WorkspaceContext | null): RawExtractedAction[] {
  const companyIds = new Set(context?.companies.map((c) => c.id) ?? [])
  const stakeholderIds = new Set(context?.stakeholders.map((s) => s.id) ?? [])
  const openActionIds = new Set(context?.openActions.map((a) => a.id) ?? [])

  return actions.map((a) => ({
    ...a,
    company_id: a.company_id && companyIds.has(a.company_id) ? a.company_id : null,
    primary_stakeholder_id: a.primary_stakeholder_id && stakeholderIds.has(a.primary_stakeholder_id) ? a.primary_stakeholder_id : null,
    possible_continuation_of: a.possible_continuation_of && openActionIds.has(a.possible_continuation_of) ? a.possible_continuation_of : null,
  }))
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
    }

    const formData = await req.formData()
    const file = formData.get('pdf') as File | null
    const pastedText = formData.get('text') as string | null

    let inputText = ''
    let filename = ''

    if (pastedText && pastedText.trim()) {
      // Plain-text / markdown paste path
      inputText = pastedText.trim()
      filename = 'pasted-text'
    } else if (file && file.size > 0) {
      // PDF upload path
      const allowedTypes = ['application/pdf', 'application/octet-stream', 'binary/octet-stream', '']
      if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
        return NextResponse.json(
          { error: `File must be a PDF (received type: "${file.type}")` },
          { status: 400 }
        )
      }

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const header = buffer.slice(0, 5).toString('ascii')
      if (!header.startsWith('%PDF')) {
        return NextResponse.json({ error: 'File does not appear to be a valid PDF' }, { status: 400 })
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse')
        const data = await pdfParse(buffer)
        inputText = data.text
          .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff')
          .replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl')
          .replace(/Ɵ/g, 'ti').replace(/ƫ/g, 'tt').replace(/ǆ/g, 'dz')
      } catch (parseErr) {
        console.error('pdf-parse error:', parseErr)
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
        return NextResponse.json({ error: `Failed to parse PDF: ${msg}` }, { status: 400 })
      }

      if (!inputText.trim()) {
        return NextResponse.json(
          { error: 'PDF text is empty — the file may be scanned/image-only and cannot be extracted' },
          { status: 400 }
        )
      }

      filename = file.name
    } else {
      return NextResponse.json({ error: 'No PDF file or text provided' }, { status: 400 })
    }

    const context = await loadWorkspaceContext(inputText)
    const systemPrompt = BASE_SYSTEM_PROMPT + buildContextBlock(context)

    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: inputText.slice(0, 120000),
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response from Claude' }, { status: 500 })
    }

    let parsed: { actions: RawExtractedAction[] }
    try {
      const cleaned = content.text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Failed to parse Claude response as JSON' }, { status: 500 })
    }

    if (!Array.isArray(parsed.actions) || parsed.actions.length === 0) {
      return NextResponse.json({ error: 'Claude could not find any action items in this document' }, { status: 400 })
    }

    const sanitized = sanitizeExtractedActions(parsed.actions, context)

    return NextResponse.json({ proposals: sanitized, filename })
  } catch (err) {
    console.error('Upload error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Internal server error: ${msg}` }, { status: 500 })
  }
}
