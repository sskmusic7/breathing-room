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
MOONSHOT_MODEL = os.environ.get("MOONSHOT_MODEL", "kimi-k2.6")


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


SIGN_OFF = """
I would be grateful if you would confirm receipt of this letter and let me know \
the outcome in writing.

Yours faithfully,
[Your name]"""

HANDOFF_STAGES = {"county_court_claim", "notice_of_intended_prosecution"}
HANDOFF_ISSUERS = {"enforcement_agent", "court", "police"}


def _grounds(facts: NoticeFacts) -> list[str]:
    m = facts.mitigating
    grounds = []
    if m.signage_obscured:
        grounds.append(
            "The signs and/or road markings at the location were missing, obscured or unclear, "
            "so the restriction was not adequately indicated. I would ask you to check the "
            "signage at this location and provide photographs of it as it was on the day."
        )
    if m.was_loading:
        grounds.append(
            "I was actively loading or unloading at the time, which is a recognised exemption "
            "for this type of restriction."
        )
    if m.emergency_pickup:
        grounds.append("I stopped only because of a genuine emergency, which I can explain and evidence if needed.")
    if m.holds_blue_badge:
        grounds.append("I hold a valid Blue Badge, which I can provide a copy of.")
    if m.neurodivergence_or_disability:
        grounds.append(
            "Under the Equality Act 2010, I ask you to take into account that the following affected "
            f"my ability to comply at the time: {m.neurodivergence_or_disability}."
        )
    if m.dependant_crisis:
        grounds.append(f"At the time I was dealing with a crisis involving someone I care for: {m.dependant_crisis}.")
    if m.other_notes:
        grounds.append(m.other_notes)
    return grounds


def _template_fallback(facts: NoticeFacts, context: list[RetrievedDoc]) -> str:
    """Plain, user-facing letter (no developer notes) when no LLM is configured."""
    if facts.issuer_type in HANDOFF_ISSUERS or facts.stage_of_notice in HANDOFF_STAGES:
        return (
            "This kind of letter needs a person, not a template.\n\n"
            "Bailiff (enforcement agent) letters and court claims have strict deadlines and "
            "specific forms. Please contact National Debtline (0808 808 4000) or Citizens Advice "
            "today. Both are free. If you're struggling with your mental health, ask about "
            "Breathing Space, which can pause most creditor action for 60 days."
        )

    ref = facts.reference_number or "[reference]"
    amount = f" for £{facts.amount_gbp}" if facts.amount_gbp else ""
    numbered = "\n\n".join(f"{i}. {g}" for i, g in enumerate(_grounds(facts), 1)) or (
        "[In your own words: why should this be cancelled? For example, what happened, "
        "and anything that made the sign hard to follow.]"
    )

    if facts.issuer_type == "creditor":
        return f"""Dear Sir/Madam,

Re: Account reference {ref}

I am writing about the above account{amount}. I am experiencing financial difficulty \
and want to agree an affordable repayment plan.

I am preparing a Standard Financial Statement, which shows what I can afford after my \
essential living costs, and I will send it to you. In the meantime, please put this \
account on hold for 30 days, stop any interest and charges, and do not pass it to a \
collection agency while we agree a plan.
{chr(10) + numbered + chr(10) if _grounds(facts) else ""}{SIGN_OFF}"""

    if facts.issuer_type == "private_parking_operator":
        return f"""Dear Sir/Madam,

Re: Parking charge {ref}{amount}

I am writing to appeal the above parking charge, issued by {facts.issuer_name} \
for an alleged breach on {facts.date_of_contravention or '[date]'}.

{numbered}

If you intend to hold the registered keeper liable, I ask you to confirm that you \
have met every requirement of Schedule 4 of the Protection of Freedoms Act 2012. \
If you reject this appeal, please provide a POPLA or IAS appeal code so I can take \
it to the independent appeals service.
{SIGN_OFF}"""

    stage = facts.stage_of_notice.replace("_", " ")
    formal = facts.stage_of_notice in {"notice_to_owner", "charge_certificate"}
    intro = (
        "I am writing to make formal representations against the above notice under the "
        "Traffic Management Act 2004"
        if formal
        else "I am writing to challenge the above penalty charge notice"
    )
    code = f" (contravention code {facts.contravention_code})" if facts.contravention_code else ""
    return f"""Dear Sir/Madam,

Re: {stage[0].upper() + stage[1:]} {ref}{amount}

{intro}, issued by {facts.issuer_name} on {facts.date_of_notice or '[date]'} for an \
alleged contravention on {facts.date_of_contravention or '[date]'}{code}.

{numbered}

I ask you to cancel this notice. If you do not, please confirm that the reduced \
payment amount will remain available while you consider this.
{SIGN_OFF}"""


def draft_representation_letter(facts: NoticeFacts) -> dict:
    """Returns {"letter": str, "citations": [...], "used_llm": bool}."""
    context = _retrieve_context(facts)
    api_key = os.environ.get("MOONSHOT_API_KEY")

    template = {
        "letter": _template_fallback(facts, context),
        "citations": [d.metadata for d in context],
        "used_llm": False,
    }
    # Bailiff and court letters go to a person, never to a model.
    handoff = facts.issuer_type in HANDOFF_ISSUERS or facts.stage_of_notice in HANDOFF_STAGES
    if not api_key or handoff:
        return template

    from openai import OpenAI  # imported lazily so the package is optional at import time

    client = OpenAI(api_key=api_key, base_url=MOONSHOT_BASE_URL, timeout=150, max_retries=4)  # KIMI allows 1 request at a time: retry 429s

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

    try:
        response = client.chat.completions.create(
            model=MOONSHOT_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            # kimi-k2.6 only accepts its default temperature (1); sending
            # anything else returns a 400 and silently fell back to the template.
            # It reasons before answering (~30-60s), and reasoning tokens count
            # against max_tokens, so leave plenty of room for the letter itself.
            max_tokens=6000,
        )
        letter = response.choices[0].message.content
    except Exception:  # out of credit, rate-limited, or down: the user still gets a letter
        return template
    if not letter:
        return template

    return {
        "letter": letter,
        "citations": [d.metadata for d in context],
        "used_llm": True,
    }
