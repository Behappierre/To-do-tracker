import { ExternalLink, ShieldCheck } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const DEFAULT_STAKEHOLDER_APP_URL = 'https://stakemapper.netlify.app'

function getStakeholderAppUrl() {
  const configuredUrl =
    process.env.STAKEHOLDER_APP_URL?.trim() || DEFAULT_STAKEHOLDER_APP_URL

  try {
    const url = new URL(configuredUrl)
    const isLocalDevelopment =
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')

    if (url.protocol !== 'https:' && !isLocalDevelopment) {
      return `${DEFAULT_STAKEHOLDER_APP_URL}/stakeholders`
    }

    url.pathname = '/stakeholders'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return `${DEFAULT_STAKEHOLDER_APP_URL}/stakeholders`
  }
}

export default async function StakeholderWorkspacePage() {
  const supabase = getAuthClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) redirect('/login')

  const stakeholderAppUrl = getStakeholderAppUrl()

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-indigo-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">
              Stakeholder workspace
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              To-do route protected
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            StakeMap remains a separate application and is displayed here as a
            connected workspace. Its data and sign-in boundary remain separate
            until the shared-data cutover is complete.
          </p>
          <p className="mt-2 inline-flex rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
            Data sync pending: this embedded view still uses StakeMap&apos;s
            original Supabase project.
          </p>
        </div>

        <a
          href={stakeholderAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Open StakeMap
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <iframe
          src={stakeholderAppUrl}
          title="StakeMap stakeholder application"
          className="h-[calc(100vh-13rem)] min-h-[640px] w-full bg-white"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
          referrerPolicy="no-referrer"
        >
          <p>
            StakeMap could not be displayed here.{' '}
            <a href={stakeholderAppUrl}>Open it in a separate tab.</a>
          </p>
        </iframe>
      </div>
    </div>
  )
}
