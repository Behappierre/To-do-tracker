/*
  These policies are intentionally deny-all. The private schema is not exposed
  to the Data API and client roles have no schema or table grants. Keeping an
  explicit policy on each table documents that the absence of client access is
  deliberate and prevents "RLS enabled without policy" ambiguity.
*/

create policy company_source_mappings_no_client_access
on private.company_source_mappings
for all
to anon, authenticated
using (false)
with check (false);

create policy stakeholder_duplicate_groups_no_client_access
on private.stakeholder_duplicate_groups
for all
to anon, authenticated
using (false)
with check (false);

create policy stakeholder_source_mappings_no_client_access
on private.stakeholder_source_mappings
for all
to anon, authenticated
using (false)
with check (false);

create policy legacy_stakemap_feature_batches_no_client_access
on private.legacy_stakemap_feature_batches
for all
to anon, authenticated
using (false)
with check (false);
