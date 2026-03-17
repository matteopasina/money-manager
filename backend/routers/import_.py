import os
import tempfile
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
import database as db
from adapters import REGISTRY
from categoriser import categorise

router = APIRouter(prefix="/api/import", tags=["import"])


@router.get("/adapters")
def list_adapters():
    return [
        {"name": name, "file_types": cls.FILE_TYPES, "imports": cls.IMPORTS}
        for name, cls in REGISTRY.items()
    ]


def _save_temp(upload: UploadFile, suffix: str) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(upload.file.read())
        return tmp.name


def _parse_records(adapter_cls, tmp_path: str, account, base_currency: str):
    """Parse an uploaded file using the given adapter. Returns (imports_type, records)."""
    adapter = adapter_cls()
    if adapter.IMPORTS == "transactions":
        rules = db.get_keyword_rules()
        def cat_fn(desc, ref):
            return categorise(desc, ref, rules)
        records = adapter.parse(tmp_path, account.id, account.currency,
                                base_currency, db.get_rate, categorise=cat_fn)
    else:
        records = adapter.parse(tmp_path, account.id, account.currency,
                                base_currency, db.get_rate)
    return adapter.IMPORTS, records


def _prepare_upload(file: UploadFile, adapter_name: str, account_id: int):
    """Validate adapter, resolve account, save temp file, parse records. Returns (imports_type, records, account)."""
    if adapter_name not in REGISTRY:
        raise HTTPException(400, f"Unknown adapter: {adapter_name}")
    account = _get_account(account_id)
    ext = os.path.splitext(file.filename or "file.bin")[1]
    tmp_path = _save_temp(file, ext)
    try:
        imports_type, records = _parse_records(
            REGISTRY[adapter_name], tmp_path, account, db.get_base_currency()
        )
        return imports_type, records, account
    finally:
        os.unlink(tmp_path)


def _get_account(account_id: int):
    accounts = db.get_accounts()
    account = next((a for a in accounts if a.id == account_id), None)
    if not account:
        raise HTTPException(400, f"Account {account_id} not found")
    return account


@router.post("/preview")
async def preview(
    file: UploadFile = File(...),
    adapter_name: str = Form(...),
    account_id: int = Form(...),
):
    imports_type, records, _ = _prepare_upload(file, adapter_name, account_id)
    if imports_type == "transactions":
        preview_rows = [
            {"date": r.date, "description": r.description,
             "amount": r.amount, "category": r.category, "reference": r.reference}
            for r in records[:20]
        ]
    else:
        preview_rows = [
            {"date": r.date, "amount_native": r.amount_native, "amount_base": r.amount_base}
            for r in records[:20]
        ]
    return {"total": len(records), "imports": imports_type, "preview": preview_rows}


@router.post("/confirm")
async def confirm(
    file: UploadFile = File(...),
    adapter_name: str = Form(...),
    account_id: int = Form(...),
):
    imports_type, records, _ = _prepare_upload(file, adapter_name, account_id)
    if imports_type == "transactions":
        rows = [
            {
                "account_id": r.account_id, "date": r.date, "description": r.description,
                "amount": r.amount, "amount_base": r.amount_base, "category": r.category,
                "value_date": r.value_date, "reference": r.reference,
                "balance": r.balance, "notes": r.notes,
            }
            for r in records
        ]
        inserted, skipped = db.insert_transactions(rows)
        return {"inserted": inserted, "skipped": skipped}
    else:
        tuples = [(r.account_id, r.date, r.amount_native, r.amount_base) for r in records]
        inserted = db.upsert_balances(tuples)
        return {"inserted": inserted, "skipped": 0}
