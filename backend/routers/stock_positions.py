from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import database as db
import stock_positions as stocks

router = APIRouter(prefix='/api/stock-positions', tags=['stock-positions'])


class PositionIn(BaseModel):
    quantity: float = Field(ge=0, allow_inf_nan=False)


@router.get('')
def list_positions():
    accounts = {a.id: a for a in db.get_accounts()}
    return [dict(account_id=int(i), account=accounts[int(i)].name, symbol='MSFT', **p)
            for i, p in stocks.positions().items() if int(i) in accounts]


@router.put('/{account_id}')
def save_position(account_id: int, body: PositionIn):
    account = next((a for a in db.get_accounts() if a.id == account_id), None)
    if account is None:
        raise HTTPException(404, 'Account not found')
    if account.account_type != 'stocks':
        raise HTTPException(422, 'Choose a stock account')
    stocks.save_quantity(account_id, body.quantity)
    return {'ok': True}


@router.post('/sync')
def sync_positions():
    try:
        message = stocks.sync()
        db.record_sync('msft', 'success', message)
        return {'message': message}
    except Exception as exc:
        db.record_sync('msft', 'error', str(exc)[:300])
        raise HTTPException(502, 'MSFT valuation unavailable; previous balances preserved. ' + str(exc)[:200]) from exc
