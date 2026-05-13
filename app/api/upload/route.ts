import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
    }

    const formData = await req.formData()
    const file = formData.get('pdf') as File | null

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 })
    }

    // Accept application/pdf and octet-stream fallback (some OS/browsers differ)
    const allowedTypes = ['application/pdf', 'application/octet-stream', 'binary/octet-stream', '']
    if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: `File must be a PDF (received type: "${file.type}")` },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Verify PDF magic bytes (%PDF-)
    const header = buffer.slice(0, 5).toString('ascii')
    if (!header.startsWith('%PDF')) {
      return NextResponse.json({ error: 'File does not appear to be a valid PDF' }, { status: 400 })
    }

    let pdfText = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      const data = await pdfParse(buffer)
      // Normalize common ligature/encoding artifacts from Outlook-exported PDFs
      pdfText = data.text
        .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff')
        .replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl')
        .replace(/Ɵ/g, 'ti').replace(/ƫ/g, 'tt').replace(/ǆ/g, 'dz')
        .replace(/ﬀ/g, 'ff').replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
    } catch (parseErr) {
      console.error('pdf-parse error:', parseErr)
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
      return NextResponse.json({ error: `Failed to parse PDF: ${msg}` }, { status: 400 })
    }

    if (!pdfText.trim()) {
      return NextResponse.json(
        { error: 'PDF text is empty — the file may be scanned/image-only and cannot be extracted' },
        { status: 400 }
      )
    }

    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: `You are a proposal tracking assistant. The text below is extracted from a PDF that may contain multiple outbound proposal or business development emails concatenated together.

Your task:
1. Read through ALL of the text from start to finish.
2. Identify EVERY distinct email. Each email typically starts with From/Sent/To/Subject headers or a new greeting. Do not skip any — process every single one.
3. For each email, extract the fields below.

Return ONLY a valid JSON object in this exact shape, with no preamble, explanation, or markdown fences:
{
  "proposals": [
    {
      "proposal_title": "a concise 5-10 word title summarising the proposal",
      "sender_name": "full name of the sender",
      "recipient_name": "full name of the primary recipient (use To: field, not Cc)",
      "recipient_company": "the company or organisation of the recipient (not the sender's company)",
      "proposal_date": "date the email was sent from the Sent: field, ISO format YYYY-MM-DD",
      "summary": "2-3 sentence plain-English summary of what is being proposed",
      "call_to_action": "the specific action or response being requested from the recipient",
      "deadline": "any deadline mentioned in ISO format YYYY-MM-DD, or null"
    }
  ]
}

Rules:
- Include ALL emails, even short follow-ups.
- If recipient_company cannot be determined from the email address or body, set it to null.
- If a field cannot be confidently extracted, set it to null.
- Never truncate the array — every email must have an entry.
- Return nothing outside the JSON object.`,
      messages: [
        {
          role: 'user',
          content: pdfText.slice(0, 120000),
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response from Claude' }, { status: 500 })
    }

    let parsed: { proposals: unknown[] }
    try {
      const cleaned = content.text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Failed to parse Claude response as JSON' }, { status: 500 })
    }

    if (!Array.isArray(parsed.proposals) || parsed.proposals.length === 0) {
      return NextResponse.json({ error: 'Claude could not find any proposals in this PDF' }, { status: 400 })
    }

    return NextResponse.json({ proposals: parsed.proposals, filename: file.name })
  } catch (err) {
    console.error('Upload error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Internal server error: ${msg}` }, { status: 500 })
  }
}
