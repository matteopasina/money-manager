from fastapi import APIRouter
from pydantic import BaseModel
import database as db
from categoriser import recategorise_all
from domain import Category, KeywordRule

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryIn(BaseModel):
    name: str
    color: str = "#6b7280"
    is_income: bool = False
    is_transfer: bool = False


class KeywordRuleIn(BaseModel):
    keyword: str
    category_name: str
    match_field: str = "any"
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
    cat = db.upsert_category(Category(id=None, name=body.name, color=body.color,
                                      is_income=body.is_income, is_transfer=body.is_transfer))
    return _cat_out(cat)


@router.put("/{category_id}")
def update_category(category_id: int, body: CategoryIn):
    db.upsert_category(Category(id=category_id, name=body.name, color=body.color,
                                is_income=body.is_income, is_transfer=body.is_transfer))
    return {"ok": True}


@router.delete("/{category_id}")
def delete_category(category_id: int):
    db.delete_category(category_id)
    return {"ok": True}


# ── Keyword rules ──────────────────────────────────────────────────────────────

@router.get("/rules")
def list_rules():
    return [_rule_out(r) for r in db.get_keyword_rules()]


@router.post("/rules", status_code=201)
def create_rule(body: KeywordRuleIn):
    rule = db.upsert_keyword_rule(KeywordRule(id=None, keyword=body.keyword,
                                              category_name=body.category_name,
                                              match_field=body.match_field,
                                              priority=body.priority))
    return _rule_out(rule)


@router.put("/rules/{rule_id}")
def update_rule(rule_id: int, body: KeywordRuleIn):
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
