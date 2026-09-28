# Data protection & sensitive data architecture

Debt details and any disclosed disability/neurodivergence information put
this squarely under UK GDPR, including its strictest category.

## Special category data (UK GDPR Article 9)

Disability, neurodivergence (ADHD, autism, etc.), and mental health
disclosures used as mitigating circumstances (see
`MitigatingCircumstances` in `backend/app/rag/draft.py`) are **special
category health data**.

- **Lawful basis**: explicit consent (Art.9(2)(a)) via a standalone,
  unbundled toggle - never pre-ticked, never bundled with general terms:
  *"I give permission for Breathing Room to process my health/neurodivergence
  details strictly to draft legal mitigating-circumstance letters."*
- **Not yet implemented**: the current MVP's `/draft-appeal` endpoint has no
  consent gate in front of it - this is the single most important thing to
  add to the frontend before any real user's data touches it. The mitigating
  circumstances fields should not even be shown until consent is recorded.

## Minimisation & redaction

- Strip names, vehicle registration marks (VRNs), and National Insurance
  numbers before anything is sent to an LLM provider (KIMI/Moonshot).
  Redact client-side, pass only anonymised metadata into the generation
  context, and re-inject identifiers into the final document locally, never
  server-side. **Not yet implemented** - `draft.py` currently passes
  `issuer_name`/`reference_number` straight through; a redaction step needs
  to sit in front of `draft_representation_letter()` before this goes near
  real user data.
- Zero-knowledge posture for anything genuinely sensitive: store sensitive
  personal medical narratives client-side (e.g. encrypted local storage /
  SQLCipher) rather than on the backend at all, where practical.

## Retention

Financial and debt documents should not linger once their purpose is
served: purge transient uploaded scans from any server storage within
24-48 hours of an appeal being finalised or a payment schedule being
generated. **Not yet implemented** - there is no storage/retention layer in
this MVP at all (uploads aren't persisted anywhere yet).

## Registration

Because the app processes personal financial and (if a user opts in) special
category health data, the operating entity must register as a **Data
Controller with the ICO** (a simple online application, roughly £40/year).
**Not yet done.**
