from domain import KeywordRule


def matching_category(
    description: str,
    reference: str,
    rules: list[KeywordRule],
) -> str | None:
    """Return the category from the first matching rule, or ``None``.

    Keeping "no rule matched" separate from the ``Other`` category matters
    when rules are re-applied to existing data: an unmatched transaction must
    retain its current (possibly manual or adapter-provided) category.
    """
    desc_lower = description.lower()
    ref_lower = (reference or "").lower()

    for rule in rules:
        kw = rule.keyword  # already stored lowercase
        if rule.match_field == "description":
            matched = kw in desc_lower
        elif rule.match_field == "reference":
            matched = kw in ref_lower
        else:  # "any"
            matched = kw in desc_lower or kw in ref_lower
        if matched:
            return rule.category_name

    return None


def categorise(description: str, reference: str, rules: list[KeywordRule]) -> str:
    """
    Apply keyword rules (pre-sorted by priority desc) to assign a category.
    Matches keyword against description and/or reference (lowercased).
    Returns 'Other' if no rule matches.
    """
    return matching_category(description, reference, rules) or "Other"


def recategorise_all(rules: list[KeywordRule]) -> int:
    """
    Apply matching rules to all existing transactions.

    Transactions that do not match a rule keep their current category. This
    preserves categories set manually or supplied by an adapter (notably
    brokerage ``Trade`` rows). Only rows whose category actually changes are
    written and counted.
    Rules should already be sorted by priority desc (as returned by database.get_keyword_rules()).
    Returns the number of transactions updated.
    """
    import database as db

    with db.get_connection() as conn:
        rows = conn.execute(
            "SELECT id, description, reference, category FROM transactions"
        ).fetchall()
        updates = []
        for row in rows:
            if row["category"] == "Trade":
                continue  # Structural brokerage activity, not merchant spending.
            new_category = matching_category(
                row["description"], row["reference"] or "", rules
            )
            if new_category is not None and new_category != row["category"]:
                updates.append((new_category, row["id"]))

        if updates:
            conn.executemany("UPDATE transactions SET category = ? WHERE id = ?", updates)
            conn.commit()

    return len(updates)
