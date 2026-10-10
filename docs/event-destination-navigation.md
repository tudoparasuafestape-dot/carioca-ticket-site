# Universal event navigation integration

This candidate combines the authenticated destination editor and versioned public contract from site #210 / backend #284 with the standalone Waze action. It does not deploy those changes.

## One destination

`CTEventUber` retains one resolver for Uber, Waze and `buildMapsDestination`. Any event ID can use `evento.destinoTransporte` when its version is 1, `eventId` matches the requested public page, `confirmed` is true, revision is a positive safe integer, latitude/longitude are finite and in range, and the four location fields match the current event. Coordinates `(0, 0)` are rejected.

A present null, malformed or unconfirmed destination disables all physical navigation. This includes legacy registry and address fallback, so an online declaration or revoked/stale destination cannot resurrect a static pin. Without the contract, the two reviewed legacy entries remain compatible. Other unmigrated legacy events retain their existing address-based Google Maps query, but have no Uber/Waze pin. They are not claimed to have a verified arrival point.

For a confirmed pin, Uber drop-off, Waze `ll`, Google Maps `destination` and embedded map `q` contain the same coordinates. The copy-address control still copies the organizer's readable address. No event-specific allowlist entry is needed for a newly confirmed event.

## Privacy and lifecycle

Building links does not make network requests or request a visitor's position. Uber/Waze/Google Maps links remain visitor-operated. Embedded maps use the existing map-consent controller and explicit one-time-load action, with default deny, no-referrer and disabled geolocation/camera/microphone permissions. One-time consent does not carry to another event. Revocation removes the iframe; rerender, loading and error paths clear the previous map and navigation state. Existing language controls and translations are retained unchanged.

Only public event responses may reach these components. Backend #284 rechecks publication/privacy gates before destination projection and does not expose approval actor, timestamp, session or producer data. The frontend is not a substitute for those backend checks.

## Registration and limits

The event list links every event to the same “Formato e localização” editor. Authorized organizers declare presencial/online/híbrido and confirm the location. Once confirmed, all navigation options are automatic. The editor still asks the organizer to obtain/check a coordinate pair; this is not automatic geocoding or an embedded pin-picker. Existing current events with no confirmed destination still require migration through that authenticated path.

The backend module, authenticated RPC routing, public projection and publication prerequisite are an operational release requiring approval. Local VM tests are not production authorization, browser visual QA or live-session/latency verification. Auth PR #285 is separate. The draft includes a pull-request-only, GitHub-hosted fixture workflow for the destination editor and both public templates. Browsers are offline, external destinations are blocked, and responses are fulfilled by fixed loopback fixtures. This workflow neither runs production RPC nor deploys. Screenshots and assertions cover a synthetic third event without adding it to the legacy registry.
