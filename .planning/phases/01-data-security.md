# Phase 01 - Data and security

## Goal

Create the Supabase schema, RLS policies, seeds, and auth conventions required by the PRD.

## Tasks

- [ ] Add migration for tables, indexes, triggers, RLS, and realtime publication.
- [ ] Seed the seven fixed production stages.
- [ ] Add settings row seed contract.
- [ ] Add admin profile policy helper.
- [ ] Document required Vercel environment variables.

## Exit criteria

- Migration can run against a Supabase project.
- RLS blocks anonymous admin-table access.
- Service role is never used in client components.
