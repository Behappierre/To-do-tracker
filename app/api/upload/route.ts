import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are a BD action tracker assistant. The input below is a meeting summary document from a rail/transport tech consultancy. Your task is to extract every discrete action item from the "Actions and Next Steps" section and return them as a JSON array.

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
      "status": "Open"
    }
  ]
}

Rules:
- Extract EVERY action item — do not skip any.
- If a field cannot be confidently extracted, set it to null.
- Return nothing outside the JSON object.`

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

    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
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

    let parsed: { actions: unknown[] }
    try {
      const cleaned = content.text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Failed to parse Claude response as JSON' }, { status: 500 })
    }

    if (!Array.isArray(parsed.actions) || parsed.actions.length === 0) {
      return NextResponse.json({ error: 'Claude could not find any action items in this document' }, { status: 400 })
    }

    return NextResponse.json({ proposals: parsed.actions, filename })
  } catch (err) {
    console.error('Upload error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Internal server error: ${msg}` }, { status: 500 })
  }
}
