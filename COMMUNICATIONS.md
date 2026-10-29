# Transactional communications frontend

Patient detail → Communications lists explicit billing contacts, shows channel availability, creates unverified contacts, records staff verification with an explicit attestation, and revokes contacts. Patient update access controls mutations; archived patients are read only. No profile/emergency contact fallbacks or local address persistence are used.

Invoice detail → Communication delivery history displays paginated metadata. Pending/retry are queued; accepted is labeled provider acceptance, never confirmed delivery. Unknown and suppressed remain distinct. Refresh retrieves status without sending.

Settings → Transactional communications provides administrators a sample-only plain-text template editor with fictional variables. It does not load or persist active configuration. React renders previews as text. Credentials and real checkout URLs are never requested.

## Backend dependencies still outstanding

- Channel/event configuration and internal copy changes need an authenticated tenant-scoped administration API and documented permission. The supplied backend offers only a trusted operator command. Do not expose credentials through a frontend configuration endpoint.
- Actual template preview needs a safe configuration/preview endpoint; sample templates are explicitly illustrative.
- Resend needs an explicit authorized backend operation with eligibility, idempotency and unknown-outcome investigation rules. The supplied backend expressly provides no resend endpoint. No resend is simulated.
- Internal recipients use eligible user IDs, not roles. Role recipients require backend support.

The endpoint descriptions do not include JSON resource schemas. Frontend expects contact arrays in the standard API data envelope with id/channel/address/role/authorized_events/verified_at/revoked_at; history expects event arrays with id/event_type/trigger/selection_outcome/created_at/deliveries. Deliveries expect id/channel/status/attempt_count/accepted_at/delivered_at/failure_reason. Pagination uses the existing standard meta envelope. Confirm these field names against the deployed backend before rollout.

Only the documented contact and history endpoints are called. No migration or live messages are triggered by frontend validation.
