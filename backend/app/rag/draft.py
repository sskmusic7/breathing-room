"""Turns retrieved legal-corpus context + user-reported facts into a draft
representation letter, using KIMI (Moonshot AI) as the primary LLM - this is
the "Best Builds Powered by KIMI" hackathon bounty integration, chosen
because its scope is open (no track restriction) and it's well suited to
long-context statutory drafting.

Falls back to a deterministic template (no LLM call at all) when no API key
is configured, so the pipeline is always demoable offline/without billing.

IMPORTANT (Legal Services Act 2007 guardrail): this module only ever
produces a DRAFT for the user to review, edit, sign, and submit themselves.
Nothing here submits, signs, or files anything on the user's behalf - see
docs/regulatory_guardrails.md.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from .query import RetrievedDoc, query_legal_corpus

MOONSHOT_BASE_URL = "https://api.moonshot.ai/v1"
MOONSHOT_MODEL = os.environ.get("MOONSHOT_MODEL", "kimi-k2-0711-preview")


@dataclass
class MitigatingCircumstances:
    """The non-judgmental vulnerability/mitigating-circumstances questionnaire
    answers (Equality Act 2010 factors). All fields optional and only ever
    collected under standalone explicit consent (UK GDPR Art.9) - see
    docs/data_protection.md.
    """

    emergency_pickup: bool = False
    signage_obscured: bool = False
    was_loading: bool = False
    neurodivergence_or_disability: str | None = None  # free text, user's own words
    dependant_crisis: str | None = None
    holds_blue_badge: bool = False
    other_notes: str | None = None


@dataclass
class NoticeFacts:
    """Facts extracted (by OCR/vision) from the scanned PCN/NIP/debt letter."""

    issuer_type: str  # local_council | private_parking_operator | police | enforcement_agent | creditor | court
    issuer_name: str
    contravention_code: str | None
    stage_of_notice: str  # penalty_charge_notice | notice_to_owner | charge_certificate | notice_of_intended_prosecution | ...
    date_of_contravention: str | None
    date_of_notice: str | None
    amount_gbp: str | None
    reference_number: str | None
    mitigating: MitigatingCircumstances = field(default_factory=MitigatingCircumstances)


def _retrieve_context(facts: NoticeFacts) -> list[RetrievedDoc]:
    query_parts = [facts.issuer_type, facts.stage_of_notice]
    if facts.contravention_code:
        query_parts.append(f"contravention code {facts.contravention_code}")
    if facts.mitigating.neurodivergence_or_disability:
        query_parts.append("disability reasonable adjustments equality act")
    if facts.mitigating.holds_blue_badge:
        query_parts.append("blue badge")

    return query_legal_corpus(" ".join(query_parts), issuer_type=facts.issuer_type, n_results=4)


def _template_fallback(facts: NoticeFacts, context: list[RetrievedDoc]) -> str:
    citations = "; ".join(f"{d.metadata.get('title')} ({d.metadata.get('citation')})" for d in context)
    mitigating_paragraph = ""
    if facts.mitigating.neurodivergence_or_disability:
        mitigating_paragraph = (
            "\n\nI am also raising, under the Equality Act 2010 (sections 20-21 and the "
            "Public Sector Equality Duty at section 149), that the following factor "
            f"affected my ability to comply at the time: {facts.mitigating.neurodivergence_or_disability}. "
            "I would ask you to have due regard to this when considering my representation."
        )

    code_suffix = f" (code {facts.contravention_code})" if facts.contravention_code else ""

    return f"""Dear Sir/Madam,

Re: {facts.stage_of_notice.replace('_', ' ').title()} - Reference {facts.reference_number or '[reference]'}

I am writing to make formal representations regarding the above notice, issued by \
{facts.issuer_name} on {facts.date_of_notice or '[date]'} in relation to an alleged \
contravention on {facts.date_of_contravention or '[date]'}{code_suffix}.

[DRAFT ONLY - review, personalise, and sign before sending. Generated without a
configured LLM provider; set MOONSHOT_API_KEY to enable full KIMI-drafted
representations grounded in the statutory context below.]

Relevant statutory context considered: {citations}
{mitigating_paragraph}

I would be grateful if you would confirm receipt of this representation and
advise of the outcome in writing.

Yours faithfully,
[Your name]

---
Breathing Room provides legal information and software tools, not legal
advice. You are responsible for reviewing and sending your own appeals.
"""


def draft_representation_letter(facts: NoticeFacts) -> dict:
    """Returns {"letter": str, "citations": [...], "used_llm": bool}."""
    context = _retrieve_context(facts)
    api_key = os.environ.get("MOONSHOT_API_KEY")

    if not api_key:
        return {
            "letter": _template_fallback(facts, context),
            "citations": [d.metadata for d in context],
            "used_llm": False,
        }

    from openai import OpenAI  # imported lazily so the package is optional at import time

    client = OpenAI(api_key=api_key, base_url=MOONSHOT_BASE_URL)

    context_block = "\n\n".join(
        f"### {d.metadata.get('title')} ({d.metadata.get('citation')})\n{d.text}" for d in context
    )
    mitigating = facts.mitigating

    system_prompt = (
        "You are a UK debt-and-parking-appeals drafting assistant for Breathing Room. "
        "You draft formal, legally-grounded representation letters for the USER to review, "
        "sign, and send themselves - you never claim to submit anything on their behalf, and "
        "you never invent statutory provisions beyond the context provided. You write with "
        "empathy when disability/neurodivergence/crisis factors are present, framing them in "
        "the register of the Equality Act 2010 without over-sharing private medical detail. "
        "End every letter with: 'Breathing Room provides legal information and software "
        "tools, not legal advice. You are responsible for reviewing and sending your own appeals.'"
    )

    user_prompt = f"""Statutory context (only rely on this, do not invent other law):
{context_block}

Notice facts:
- Issuer: {facts.issuer_name} ({facts.issuer_type})
- Stage: {facts.stage_of_notice}
- Contravention code: {facts.contravention_code}
- Date of notice: {facts.date_of_notice}
- Date of alleged contravention: {facts.date_of_contravention}
- Amount: {facts.amount_gbp}
- Reference: {facts.reference_number}

Mitigating circumstances reported by the user (only mention what's relevant, don't over-disclose):
- Emergency pickup: {mitigating.emergency_pickup}
- Signage obscured: {mitigating.signage_obscured}
- Was loading: {mitigating.was_loading}
- Neurodivergence/disability: {mitigating.neurodivergence_or_disability}
- Dependant crisis: {mitigating.dependant_crisis}
- Holds Blue Badge: {mitigating.holds_blue_badge}
- Other notes: {mitigating.other_notes}

Draft the formal representation letter now."""

    response = client.chat.completions.create(
        model=MOONSHOT_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
    )

    letter = response.choices[0].message.content

    return {
        "letter": letter,
        "citations": [d.metadata for d in context],
        "used_llm": True,
    }
