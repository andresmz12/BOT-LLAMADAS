import logging

from sqlmodel import Session, select

from models import EmailEvent, Prospect, SequenceProspectState, SequenceRule

logger = logging.getLogger(__name__)

VALID_CONDITIONS = {"no_open", "opened_no_click", "clicked", "bounced"}
VALID_ACTIONS = {"send_variant", "skip_step", "mark_hot", "stop_sequence"}


def _condition_for(email: str, opened: set, clicked: set, bounced: set) -> str:
    if email in bounced:
        return "bounced"
    if email in clicked:
        return "clicked"
    if email in opened:
        return "opened_no_click"
    return "no_open"


def apply_rules_for_step(
    session: Session,
    organization_id: int,
    sequence_id: int,
    sequence_step: int,
    email_list_id: int = None,
) -> tuple[set[str], dict[str, tuple[str, str]]]:
    """Evaluate SequenceRule branches before firing `sequence_step` of `sequence_id`.

    Returns (excluded_emails, variant_overrides):
    - excluded_emails: lowercased emails to skip entirely for this send
      (stop_sequence — persisted so it also suppresses every later step —
      or skip_step, which only affects this one step).
    - variant_overrides: email -> (subject, body) for send_variant matches.

    mark_hot is applied immediately as a side effect (sets Prospect.email_label).
    Rules are evaluated only against the step immediately before this one
    (after_step == sequence_step - 1) — a simplification that covers the
    common "email 2 depends on email 1's behavior" case without needing to
    look further back in the chain.
    """
    excluded: set[str] = set()
    variants: dict[str, tuple[str, str]] = {}

    # Persistent stop: once a prospect is marked stopped for this sequence
    # (by any earlier step's rule), keep excluding them regardless of
    # whether the current step has a matching rule of its own.
    stopped_rows = session.exec(
        select(SequenceProspectState.prospect_email).where(
            SequenceProspectState.sequence_id == sequence_id,
            SequenceProspectState.stopped == True,  # noqa: E712
        )
    ).all()
    excluded.update((e or "").strip().lower() for e in stopped_rows)

    if not sequence_step or sequence_step <= 1:
        return excluded, variants

    prev_step = sequence_step - 1
    rules = session.exec(
        select(SequenceRule).where(
            SequenceRule.sequence_id == sequence_id,
            SequenceRule.after_step == prev_step,
        )
    ).all()
    if not rules:
        return excluded, variants

    prev_events = session.exec(
        select(EmailEvent).where(
            EmailEvent.organization_id == organization_id,
            EmailEvent.sequence_id == sequence_id,
            EmailEvent.sequence_step == prev_step,
        )
    ).all()
    opened: set[str] = set()
    clicked: set[str] = set()
    bounced: set[str] = set()
    for e in prev_events:
        email = (e.prospect_email or "").strip().lower()
        if e.event_type == "open":
            opened.add(email)
        elif e.event_type == "click":
            clicked.add(email)
        elif e.event_type in ("bounce", "dropped"):
            bounced.add(email)

    candidate_q = select(Prospect.email).where(
        Prospect.organization_id == organization_id,
        Prospect.email.is_not(None),
        Prospect.email != "",
    )
    if email_list_id:
        candidate_q = candidate_q.where(Prospect.email_list_id == email_list_id)
    candidate_emails = session.exec(candidate_q).all()

    any_stop = False
    for raw_email in candidate_emails:
        email = (raw_email or "").strip().lower()
        if not email or email in excluded:
            continue
        cond = _condition_for(email, opened, clicked, bounced)
        for rule in rules:
            if rule.condition != cond:
                continue
            if rule.action == "stop_sequence":
                excluded.add(email)
                session.add(SequenceProspectState(
                    sequence_id=sequence_id, prospect_email=email,
                    stopped=True, reason=f"rule:{rule.id}",
                ))
                any_stop = True
            elif rule.action == "skip_step":
                excluded.add(email)
            elif rule.action == "mark_hot":
                p = session.exec(
                    select(Prospect).where(
                        Prospect.organization_id == organization_id,
                        Prospect.email == raw_email,
                    )
                ).first()
                if p:
                    p.email_label = "interested"
                    session.add(p)
            elif rule.action == "send_variant" and rule.variant_subject:
                variants[email] = (rule.variant_subject, rule.variant_body or "")
            break  # first matching rule for this prospect wins

    if any_stop:
        session.commit()

    logger.info(
        f"[SeqRules] seq={sequence_id} step={sequence_step} rules={len(rules)} "
        f"excluded={len(excluded)} variants={len(variants)}"
    )
    return excluded, variants
