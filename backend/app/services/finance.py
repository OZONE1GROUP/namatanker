"""
Phase 8 — finance & revenue-share module (price-per-liter, inbound/outbound
transaction ledger, and commission allocation/reporting).

The platform's model is revenue share: a closed order's full value is
collected from the customer (one inbound Transaction), and that value minus
the platform's configured commission percentage is paid out to the station
(one outbound Transaction). The platform's own retained revenue is the
difference between the two legs — reported, not stored as a third row.

SIMULATION MODE: every transaction here is a synthetic ledger entry. The
"payment gateway" is a labeled configuration/demo toggle (see
PlatformSettings) — this module never connects to a real payment processor
and never stores real payment credentials.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.core import AuditEntry, Order, PlatformSettings, ProductPricing, Station, Transaction
from app.models.enums import Product, TransactionCategory, TransactionType

# Seeded defaults (OMR per liter) — plausible SIMULATION MODE figures, not
# live market pricing. Used by app/seed.py and as a fallback if pricing
# rows are ever missing.
DEFAULT_PRICING_OMR: dict[Product, Decimal] = {
    Product.diesel: Decimal("0.1900"),
    Product.petrol_91: Decimal("0.1780"),
    Product.petrol_95: Decimal("0.1970"),
    Product.jet_fuel: Decimal("0.2100"),
    Product.lpg: Decimal("0.1650"),
}

DEFAULT_COMMISSION_PCT = Decimal("12.50")


def _round(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def get_platform_settings(db: Session) -> PlatformSettings:
    settings = db.get(PlatformSettings, 1)
    if settings is None:
        settings = PlatformSettings(id=1, platform_commission_pct=DEFAULT_COMMISSION_PCT)
        db.add(settings)
        db.flush()
    return settings


def list_pricing(db: Session) -> list[ProductPricing]:
    return list(db.execute(select(ProductPricing).order_by(ProductPricing.id)).scalars().all())


def get_price_per_liter(db: Session, product: Product) -> Decimal | None:
    row = db.get(ProductPricing, product.value)
    return Decimal(row.price_per_liter) if row else None


def upsert_pricing(db: Session, product: Product, price_per_liter: Decimal, actor: str) -> ProductPricing:
    row = db.get(ProductPricing, product.value)
    previous = str(row.price_per_liter) if row else None
    if row:
        row.price_per_liter = price_per_liter
    else:
        row = ProductPricing(id=product.value, product=product, price_per_liter=price_per_liter)
        db.add(row)
    db.add(
        AuditEntry(
            actor=actor,
            action="update_pricing",
            entity_type="product_pricing",
            entity_id=product.value,
            previous_state=previous,
            new_state=str(price_per_liter),
            reason=f"Price per liter for {product.value} set to {price_per_liter} OMR",
        )
    )
    return row


def update_platform_settings(
    db: Session,
    actor: str,
    *,
    platform_commission_pct: Decimal | None = None,
    payment_gateway_enabled: bool | None = None,
    payment_gateway_provider: str | None = None,
    payment_gateway_mode: str | None = None,
    payment_gateway_reference: str | None = None,
) -> PlatformSettings:
    settings = get_platform_settings(db)
    previous = (
        f"commission={settings.platform_commission_pct}%, "
        f"gateway={settings.payment_gateway_provider or 'none'} "
        f"({'enabled' if settings.payment_gateway_enabled else 'disabled'}, {settings.payment_gateway_mode})"
    )
    if platform_commission_pct is not None:
        settings.platform_commission_pct = platform_commission_pct
    if payment_gateway_enabled is not None:
        settings.payment_gateway_enabled = payment_gateway_enabled
    if payment_gateway_provider is not None:
        settings.payment_gateway_provider = payment_gateway_provider or None
    if payment_gateway_mode is not None:
        settings.payment_gateway_mode = payment_gateway_mode
    if payment_gateway_reference is not None:
        settings.payment_gateway_reference = payment_gateway_reference or None
    new = (
        f"commission={settings.platform_commission_pct}%, "
        f"gateway={settings.payment_gateway_provider or 'none'} "
        f"({'enabled' if settings.payment_gateway_enabled else 'disabled'}, {settings.payment_gateway_mode})"
    )
    db.add(
        AuditEntry(
            actor=actor,
            action="update_platform_settings",
            entity_type="platform_settings",
            entity_id="1",
            previous_state=previous,
            new_state=new,
        )
    )
    return settings


def compute_order_value(db: Session, order: Order) -> Decimal | None:
    """Order value = best-known delivered quantity × price per liter."""
    qty = (
        order.delivery_quantity_l
        or order.actual_loaded_quantity_l
        or order.authorized_quantity_l
        or order.requested_quantity_l
    )
    if not qty:
        return None
    price = get_price_per_liter(db, order.product)
    if price is None:
        return None
    return _round(Decimal(qty) * price)


def generate_order_transactions(db: Session, order: Order, actor: str = "System (auto-generated)") -> list[Transaction]:
    """
    Post the inbound/outbound transaction pair for a just-closed order.
    Idempotent: returns [] (no-op) if this order already has transactions,
    or if the order's value can't be computed yet (e.g. no price configured
    for its product) — the finance page then shows it as "value not
    defined" rather than silently posting a zero/incorrect transaction.
    """
    already = db.execute(select(Transaction.id).where(Transaction.order_id == order.id)).first()
    if already:
        return []

    gross = compute_order_value(db, order)
    if gross is None:
        return []

    settings = get_platform_settings(db)
    commission_pct = Decimal(settings.platform_commission_pct)
    commission_amount = _round(gross * commission_pct / Decimal(100))
    net_amount = _round(gross - commission_amount)

    seq = (db.scalar(select(func.count()).select_from(Transaction)) or 0) + 1
    payment_method = "payment_gateway" if settings.payment_gateway_enabled else "internal_ledger"

    inbound = Transaction(
        transaction_number=f"TXN-{seq:06d}",
        order_id=order.id,
        type=TransactionType.inbound,
        category=TransactionCategory.customer_payment,
        amount=gross,
        currency="OMR",
        counterparty_type="customer",
        counterparty_name=order.customer.name if order.customer else "Customer",
        commission_pct=commission_pct,
        commission_amount=commission_amount,
        net_amount=net_amount,
        payment_method=payment_method,
        status="completed",
        description=f"Customer payment for {order.order_number} ({order.product.value}, {gross} OMR gross)",
    )
    db.add(inbound)

    outbound = Transaction(
        transaction_number=f"TXN-{seq + 1:06d}",
        order_id=order.id,
        type=TransactionType.outbound,
        category=TransactionCategory.station_payout,
        amount=net_amount,
        currency="OMR",
        counterparty_type="station",
        counterparty_name=order.station.name if order.station else "Station",
        commission_pct=commission_pct,
        commission_amount=commission_amount,
        net_amount=net_amount,
        payment_method="internal_ledger",
        status="completed",
        description=(
            f"Revenue-share payout to {order.station.name if order.station else 'station'} "
            f"for {order.order_number} (platform commission {commission_pct}%)"
        ),
    )
    db.add(outbound)
    # Flush now (not just at the end of the caller's transaction) so that
    # the next call's "count of existing transactions" sequence lookup sees
    # these two rows too — without this, back-to-back calls within the same
    # session (e.g. seeding many closed orders in a loop) would all read
    # the same stale count and collide on transaction_number.
    db.flush()

    db.add(
        AuditEntry(
            actor=actor,
            action="generate_finance_transactions",
            entity_type="order",
            entity_id=order.id,
            new_state="transactions_posted",
            reason=f"Gross {gross} OMR, commission {commission_amount} OMR ({commission_pct}%), payout {net_amount} OMR",
        )
    )
    return [inbound, outbound]


def list_transactions(
    db: Session,
    *,
    type_: TransactionType | None = None,
    category: TransactionCategory | None = None,
    order_id: str | None = None,
    station_id: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> tuple[list[Transaction], int]:
    query = select(Transaction)
    filters = []
    if type_:
        filters.append(Transaction.type == type_)
    if category:
        filters.append(Transaction.category == category)
    if order_id:
        filters.append(Transaction.order_id == order_id)
    if station_id:
        query = query.join(Order, Transaction.order_id == Order.id)
        filters.append(Order.station_id == station_id)
    if search:
        filters.append(Transaction.transaction_number.ilike(f"%{search}%"))
    query = query.where(*filters)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(
        query.order_by(Transaction.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).scalars().all()
    return list(rows), total


def get_finance_summary(db: Session, days: int = 30) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(select(Transaction).where(Transaction.created_at >= since)).scalars().all()

    total_inbound = sum((Decimal(r.amount) for r in rows if r.type == TransactionType.inbound), Decimal("0"))
    total_outbound = sum((Decimal(r.amount) for r in rows if r.type == TransactionType.outbound), Decimal("0"))
    platform_net_revenue = sum(
        (Decimal(r.commission_amount) for r in rows if r.category == TransactionCategory.customer_payment and r.commission_amount is not None),
        Decimal("0"),
    )
    orders_with_transactions = len({r.order_id for r in rows if r.order_id})

    return {
        "period_days": days,
        "total_inbound": total_inbound,
        "total_outbound": total_outbound,
        "platform_net_revenue": platform_net_revenue,
        "transaction_count": len(rows),
        "orders_with_transactions": orders_with_transactions,
    }


def get_commission_report(db: Session, days: int = 30) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(
        select(Transaction, Station)
        .join(Order, Transaction.order_id == Order.id)
        .join(Station, Order.station_id == Station.id)
        .where(Transaction.category == TransactionCategory.customer_payment, Transaction.created_at >= since)
    ).all()

    by_station: dict[str, dict] = {}
    for txn, station in rows:
        bucket = by_station.setdefault(
            station.id,
            {
                "station_id": station.id,
                "station_name": station.name,
                "order_count": 0,
                "gross_revenue": Decimal("0"),
                "commission_amount": Decimal("0"),
                "net_payout": Decimal("0"),
            },
        )
        bucket["order_count"] += 1
        bucket["gross_revenue"] += Decimal(txn.amount)
        bucket["commission_amount"] += Decimal(txn.commission_amount or 0)
        bucket["net_payout"] += Decimal(txn.net_amount or 0)

    return sorted(by_station.values(), key=lambda b: b["gross_revenue"], reverse=True)
