from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.core import Customer
from app.schemas.customers import CustomerOut

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=list[CustomerOut])
def list_customers(db: Session = Depends(get_db)):
    customers = db.execute(select(Customer).order_by(Customer.name)).scalars().all()
    return [CustomerOut.model_validate(c) for c in customers]
