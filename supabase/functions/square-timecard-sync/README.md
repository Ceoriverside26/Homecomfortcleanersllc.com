# Square Sandbox timecard sync

This Edge Function is intentionally Sandbox-only.

Required Edge Function secrets:
- SQUARE_SANDBOX_ACCESS_TOKEN
- SQUARE_SANDBOX_LOCATION_ID

Do not commit either value to GitHub.

The caller must be the authenticated Home Comfort owner account. The function re-reads the selected time entry server-side and refuses to sync unless it is completed and management-approved.

Square requires location_id, team_member_id, and start_at to create a timecard. This function also sends end_at and America/New_York so approved shifts arrive closed.

Before production rollout, add persistent sync metadata/audit storage (Square timecard ID, status, error, synced_at) in Supabase and an employee-to-Square TeamMember mapping table. Production credentials must use separate secrets and endpoint configuration.
