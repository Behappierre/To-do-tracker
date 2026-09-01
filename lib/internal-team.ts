import { EntityOptions } from '@/types/proposal'

// Resolved by well-known name rather than a hardcoded id, so this works
// the same way across environments as the workspace slug lookup does.
export const INTERNAL_COMPANY_NAME = 'Netcompany'
export const DEFAULT_FOLLOWUP_STAKEHOLDER_NAME = 'Harry Kaur'

export function getInternalTeamOptions(entities: EntityOptions) {
  const internalCompany = entities.companies.find((c) => c.name === INTERNAL_COMPANY_NAME)
  if (!internalCompany) return []
  return entities.stakeholders.filter((s) => s.company_id === internalCompany.id)
}

export function getDefaultFollowUpStakeholderIdFromEntities(entities: EntityOptions) {
  return getInternalTeamOptions(entities)
    .find((s) => s.full_name === DEFAULT_FOLLOWUP_STAKEHOLDER_NAME)?.id ?? null
}
