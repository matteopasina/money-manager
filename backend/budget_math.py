"""Shared month arithmetic and derived budget rollover calculations."""
from domain import Budget


def shift_month(month: str, offset: int) -> str:
    y, m = int(month[:4]), int(month[5:7])
    total = y * 12 + (m - 1) + offset
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def month_range(start: str, end_exclusive: str) -> list[str]:
    """['YYYY-MM', ...] from start up to but not including end_exclusive."""
    months = []
    m = start
    while m < end_exclusive:
        months.append(m)
        m = shift_month(m, 1)
    return months


def budget_status(b: Budget, spend: dict[str, float], month: str) -> dict:
    spent = round(spend.get(month, 0.0), 2)
    carry = 0.0
    if b.rollover:
        for m in month_range(b.start_month, month):
            carry += b.monthly_amount - spend.get(m, 0.0)
    carry = round(carry, 2)
    effective = round(b.monthly_amount + carry, 2)
    remaining = round(effective - spent, 2)
    pct = round(spent / effective * 100, 1) if effective > 0 else None
    return {"spent": spent, "carry": carry, "effective": effective,
            "remaining": remaining, "pct": pct}
