from domain import KeywordRule


def categorise(description: str, reference: str, rules: list[KeywordRule]) -> str:
    """
    Apply keyword rules (pre-sorted by priority desc) to assign a category.
    Matches keyword against description and/or reference (lowercased).
    Returns 'Other' if no rule matches.
    """
    desc_lower = description.lower()
    ref_lower = (reference or "").lower()

    for rule in rules:
        kw = rule.keyword  # already stored lowercase
        if rule.match_field == "description":
            if kw in desc_lower:
                return rule.category_name
        elif rule.match_field == "reference":
            if kw in ref_lower:
                return rule.category_name
        else:  # "any"
            if kw in desc_lower or kw in ref_lower:
                return rule.category_name

    return "Other"


def recategorise_all(rules: list[KeywordRule]) -> int:
    """
    Re-run categoriser on all existing transactions using the provided rules.
    Rules should already be sorted by priority desc (as returned by database.get_keyword_rules()).
    Returns the number of transactions updated.
    """
    import database as db

    with db.get_connection() as conn:
        rows = conn.execute(
            "SELECT id, description, reference FROM transactions"
        ).fetchall()
        updates = [
            (categorise(row["description"], row["reference"] or "", rules), row["id"])
            for row in rows
        ]
        conn.executemany("UPDATE transactions SET category = ? WHERE id = ?", updates)
        conn.commit()

    return len(rows)
