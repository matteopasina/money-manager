import sqlite3
from typing import Annotated, Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, StringConstraints
import database as db
from categoriser import recategorise_all
from domain import Category, KeywordRule

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    color: str = "#6b7280"
    is_income: bool = False
    is_transfer: bool = False


class KeywordRuleIn(BaseModel):
    keyword: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    category_name: str
    match_field: Literal["description", "reference", "any"] = "any"
    priority: int = 0


def _cat_out(c: Category):
    return {"id": c.id, "name": c.name, "color": c.color,
            "is_income": c.is_income, "is_transfer": c.is_transfer}


def _rule_out(r: KeywordRule):
    return {"id": r.id, "keyword": r.keyword, "category_name": r.category_name,
            "match_field": r.match_field, "priority": r.priority}


# ── Categories ─────────────────────────────────────────────────────────────────

@router.get("")
def list_categories():
    return [_cat_out(c) for c in db.get_categories()]


@router.post("", status_code=201)
def create_category(body: CategoryIn):
    try:
        cat = db.upsert_category(Category(id=None, name=body.name, color=body.color,
                                          is_income=body.is_income, is_transfer=body.is_transfer))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "A category with this name already exists")
    return _cat_out(cat)


@router.put("/{category_id}")
def update_category(category_id: int, body: CategoryIn):
    try:
        db.upsert_category(Category(id=category_id, name=body.name, color=body.color,
                                    is_income=body.is_income, is_transfer=body.is_transfer))
    except ValueError:
        raise HTTPException(404, "Category not found")
    except sqlite3.IntegrityError:
        raise HTTPException(409, "A category with this name already exists")
    return {"ok": True}


@router.delete("/{category_id}")
def delete_category(category_id: int):
    db.delete_category(category_id)
    return {"ok": True}


@router.post("/reset-colors")
def reset_colors():
    updated = db.reset_default_category_colors()
    return {"updated": updated}


# ── Keyword rules ──────────────────────────────────────────────────────────────

@router.get("/rules")
def list_rules():
    return [_rule_out(r) for r in db.get_keyword_rules()]


@router.post("/rules", status_code=201)
def create_rule(body: KeywordRuleIn):
    if body.category_name not in {c.name for c in db.get_categories()}:
        raise HTTPException(400, "Rule category not found")
    rule = db.upsert_keyword_rule(KeywordRule(id=None, keyword=body.keyword,
                                              category_name=body.category_name,
                                              match_field=body.match_field,
                                              priority=body.priority))
    return _rule_out(rule)


@router.put("/rules/{rule_id}")
def update_rule(rule_id: int, body: KeywordRuleIn):
    if body.category_name not in {c.name for c in db.get_categories()}:
        raise HTTPException(400, "Rule category not found")
    db.upsert_keyword_rule(KeywordRule(id=rule_id, keyword=body.keyword,
                                       category_name=body.category_name,
                                       match_field=body.match_field,
                                       priority=body.priority))
    return {"ok": True}


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int):
    db.delete_keyword_rule(rule_id)
    return {"ok": True}


@router.post("/rules/reapply")
def reapply_rules():
    rules = db.get_keyword_rules()
    count = recategorise_all(rules)
    return {"updated": count}


@router.post("/rules/seed-defaults")
def seed_default_rules():
    inserted, skipped = db.seed_keyword_rules_defaults()
    return {"inserted": inserted, "skipped": skipped}
