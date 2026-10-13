"""Scan a letter: read a photo of a notice with KIMI vision and return the
appeal form's fields, so the user checks details instead of typing them.

The image is sent to Moonshot for this one request and never stored.
"""
from __future__ import annotations

import json
import os
import re

from app.rag.draft import MOONSHOT_BASE_URL

# kimi-k3 reads a PCN in ~15s; kimi-k2.6 takes ~50s for the same image.
VISION_MODEL = os.environ.get("MOONSHOT_VISION_MODEL", "kimi-k3")
MAX_IMAGE_CHARS = 8_000_000  # ~6MB image as a base64 data URL

ISSUER_TYPES = ["local_council", "private_parking_operator", "police", "enforcement_agent", "creditor", "court"]
STAGES = [
    "penalty_charge_notice",
    "notice_to_owner",
    "charge_certificate",
    "notice_of_intended_prosecution",
    "parking_charge_notice",
    "letter_before_action",
    "county_court_claim",
]

PROMPT = f"""This is a photo of a UK letter about a fine, parking charge or debt.
Read it and return JSON only, no other text, with these keys (null if not shown):
- issuer_type: one of {ISSUER_TYPES}. A "Penalty Charge Notice" from a council is local_council; a "Parking Charge Notice" from a company is private_parking_operator; bailiffs / enforcement agents are enforcement_agent.
- issuer_name: who sent it, short, e.g. "Lambeth" for London Borough of Lambeth.
- stage_of_notice: one of {STAGES}.
- reference_number: the PCN / reference / account number.
- contravention_code: the contravention code if any, digits only.
- date_of_contravention: YYYY-MM-DD.
- date_of_notice: the date printed on the letter, YYYY-MM-DD.
- amount_gbp: the full amount due as a number.
- creditor_bank: if the letter says how to pay by bank transfer, an object with sort_code, account_no, payee_name; else null.
- readable: false if this isn't a letter or is too blurry to read."""


class ScanError(Exception):
    pass


def scan_letter(image_data_url: str) -> dict:
    api_key = os.environ.get("MOONSHOT_API_KEY")
    if not api_key:
        raise ScanError("Letter scanning isn't set up yet. Please type the details in.")
    if not image_data_url.startswith("data:image/") or len(image_data_url) > MAX_IMAGE_CHARS:
        raise ScanError("Please use a photo (JPG or PNG) under 6MB.")

    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=MOONSHOT_BASE_URL, timeout=90, max_retries=0)
    response = client.chat.completions.create(
        model=VISION_MODEL,
        max_tokens=4000,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                    {"type": "text", "text": PROMPT},
                ],
            }
        ],
    )
    text = response.choices[0].message.content or ""
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise ScanError("We couldn't read that letter. Try a clearer photo, or type the details in.")
    fields = json.loads(match.group(0))
    if fields.get("readable") is False:
        raise ScanError("That photo is hard to read. Try again in good light, flat on a table.")
    if fields.get("issuer_type") not in ISSUER_TYPES:
        fields["issuer_type"] = None
    if fields.get("stage_of_notice") not in STAGES:
        fields["stage_of_notice"] = None
    fields["model"] = VISION_MODEL
    return fields
