from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, BeforeValidator

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24  # 1 day
REFRESH_TOKEN_DAYS = 7

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Naija Invest Platform API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers - hashing / jwt
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                        max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                        max_age=REFRESH_TOKEN_DAYS * 86400, path="/")


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def normalize_phone(phone: str) -> str:
    phone = phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("0") and len(phone) == 11:
        phone = "+234" + phone[1:]
    elif phone.startswith("234") and not phone.startswith("+"):
        phone = "+" + phone
    return phone


PHONE_RE = re.compile(r"^\+234\d{10}$")


def valid_phone(phone: str) -> bool:
    return bool(PHONE_RE.match(phone))


def gen_referral_code() -> str:
    return secrets.token_hex(4).upper()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")


def clean(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    # Stringify any remaining ObjectId fields to keep FastAPI JSON serializer happy
    for k, v in list(doc.items()):
        if isinstance(v, ObjectId):
            doc[k] = str(v)
        elif isinstance(v, list):
            doc[k] = [str(x) if isinstance(x, ObjectId) else x for x in v]
    return doc


# ---------------------------------------------------------------------------
# Auth deps
# ---------------------------------------------------------------------------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_admin_user(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ---------------------------------------------------------------------------
# Settings helpers
# ---------------------------------------------------------------------------
DEFAULT_SETTINGS = {
    "referral_gen1_pct": 20.0,
    "referral_gen2_pct": 5.0,
    "referral_gen3_pct": 2.0,
    "welcome_bonus": 500.0,
    "min_withdrawal": 1000.0,
    "min_deposit": 500.0,
    "site_name": "NaijaInvest",
}


async def get_settings() -> dict:
    s = await db.settings.find_one({"_id": "global"})
    if not s:
        await db.settings.insert_one({"_id": "global", **DEFAULT_SETTINGS})
        return {"_id": "global", **DEFAULT_SETTINGS}
    # ensure all defaults exist
    for k, v in DEFAULT_SETTINGS.items():
        if k not in s:
            s[k] = v
    return s


# ---------------------------------------------------------------------------
# Startup: indexes + admin seed
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("phone", unique=True)
    await db.users.create_index("referral_code", unique=True)
    await db.products.create_index("active")
    await db.investments.create_index("user_id")
    await db.transactions.create_index([("user_id", 1), ("created_at", -1)])
    await db.deposits.create_index([("user_id", 1), ("created_at", -1)])
    await db.withdrawals.create_index([("user_id", 1), ("created_at", -1)])
    await db.coupons.create_index("code", unique=True)
    await get_settings()

    admin_phone = normalize_phone(os.environ.get("ADMIN_PHONE", "+2348000000000"))
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@12345")
    admin_name = os.environ.get("ADMIN_NAME", "Platform Admin")

    existing = await db.users.find_one({"phone": admin_phone})
    if not existing:
        await db.users.insert_one({
            "phone": admin_phone,
            "name": admin_name,
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "wallet_balance": 0.0,
            "bonus_balance": 0.0,
            "total_earned": 0.0,
            "total_invested": 0.0,
            "referral_code": "ADMIN001",
            "referred_by": None,
            "has_invested": False,
            "welcome_bonus_given": True,
            "created_at": now_utc().isoformat(),
        })
        logger.info("Seeded admin user %s", admin_phone)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"_id": existing["_id"]},
                                  {"$set": {"password_hash": hash_password(admin_password)}})
        logger.info("Updated admin password")

    # Seed default products if none exist
    if await db.products.count_documents({}) == 0:
        starter = [
            {"name": "Starter Plan", "price": 5000.0, "daily_profit_pct": 5.0, "duration_days": 30,
             "description": "Perfect for new investors. Low entry, steady growth.", "active": True,
             "created_at": now_utc().isoformat()},
            {"name": "Silver Plan", "price": 20000.0, "daily_profit_pct": 6.0, "duration_days": 30,
             "description": "Balanced returns for serious investors.", "active": True,
             "created_at": now_utc().isoformat()},
            {"name": "Gold Plan", "price": 100000.0, "daily_profit_pct": 7.5, "duration_days": 45,
             "description": "Elite tier for maximum ROI.", "active": True,
             "created_at": now_utc().isoformat()},
        ]
        await db.products.insert_many(starter)


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    phone: str
    password: str
    name: str
    referral_code: Optional[str] = None


class LoginIn(BaseModel):
    phone: str
    password: str


class ProductIn(BaseModel):
    name: str
    price: float
    daily_profit_pct: float
    duration_days: int
    description: Optional[str] = ""
    active: bool = True


class InvestIn(BaseModel):
    product_id: str


class DepositCreateIn(BaseModel):
    amount: float
    method: str  # payment account id or name
    reference: Optional[str] = ""


class WithdrawCreateIn(BaseModel):
    amount: float
    bank_name: str
    account_number: str
    account_name: str


class ApprovalIn(BaseModel):
    note: Optional[str] = ""


class AddBalanceIn(BaseModel):
    amount: float
    note: Optional[str] = "Admin credit"


class CouponIn(BaseModel):
    code: str
    amount: float
    max_uses: int = 1
    active: bool = True


class CouponRedeemIn(BaseModel):
    code: str


class AccountIn(BaseModel):
    bank_name: str
    account_name: str
    account_number: str
    active: bool = True


class SettingsIn(BaseModel):
    referral_gen1_pct: Optional[float] = None
    referral_gen2_pct: Optional[float] = None
    referral_gen3_pct: Optional[float] = None
    welcome_bonus: Optional[float] = None
    min_withdrawal: Optional[float] = None
    min_deposit: Optional[float] = None
    site_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Transactions helper
# ---------------------------------------------------------------------------
async def add_transaction(user_id: ObjectId, tx_type: str, amount: float, note: str = "", meta: Optional[dict] = None):
    doc = {
        "user_id": user_id,
        "type": tx_type,
        "amount": amount,
        "note": note,
        "meta": meta or {},
        "created_at": now_utc().isoformat(),
    }
    await db.transactions.insert_one(doc)


# ---------------------------------------------------------------------------
# Daily profit drop (lazy on read)
# ---------------------------------------------------------------------------
async def process_profit_drops(user: dict) -> dict:
    """Credit any due daily profits for the user's active investments."""
    now = now_utc()
    active = db.investments.find({"user_id": user["_id"], "status": "active"})
    total_credit = 0.0
    async for inv in active:
        last = inv.get("last_drop_at")
        if isinstance(last, str):
            last = datetime.fromisoformat(last)
        else:
            last = datetime.fromisoformat(inv["created_at"]) if isinstance(inv.get("created_at"), str) else inv["created_at"]
        elapsed = now - last
        cycles_due = int(elapsed.total_seconds() // 86400)
        drops_done = inv.get("drops_done", 0)
        remaining = inv["duration_days"] - drops_done
        cycles = min(cycles_due, remaining)
        if cycles <= 0:
            continue
        daily = inv["price"] * (inv["daily_profit_pct"] / 100.0)
        credit = daily * cycles
        new_drops = drops_done + cycles
        new_last = last + timedelta(days=cycles)
        status = "completed" if new_drops >= inv["duration_days"] else "active"
        await db.investments.update_one(
            {"_id": inv["_id"]},
            {"$set": {"drops_done": new_drops, "last_drop_at": new_last.isoformat(),
                      "total_earned": inv.get("total_earned", 0.0) + credit, "status": status}},
        )
        total_credit += credit
        await add_transaction(user["_id"], "profit", credit,
                              f"Daily profit x{cycles} - {inv.get('product_name', 'Investment')}",
                              {"investment_id": str(inv["_id"])})
    if total_credit > 0:
        await db.users.update_one({"_id": user["_id"]},
                                  {"$inc": {"wallet_balance": total_credit, "total_earned": total_credit}})
        user = await db.users.find_one({"_id": user["_id"]})
    return user


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    phone = normalize_phone(payload.phone)
    if not valid_phone(phone):
        raise HTTPException(400, "Invalid Nigerian phone number. Use +234XXXXXXXXXX or 0XXXXXXXXXX")
    if len(payload.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if not payload.name.strip():
        raise HTTPException(400, "Name is required")
    if await db.users.find_one({"phone": phone}):
        raise HTTPException(400, "Phone already registered")

    settings = await get_settings()
    referred_by = None
    if payload.referral_code:
        ref_user = await db.users.find_one({"referral_code": payload.referral_code.upper().strip()})
        if not ref_user:
            raise HTTPException(400, "Invalid referral code")
        referred_by = ref_user["_id"]

    # generate unique referral code
    for _ in range(5):
        code = gen_referral_code()
        if not await db.users.find_one({"referral_code": code}):
            break

    welcome = float(settings.get("welcome_bonus", 500.0))
    doc = {
        "phone": phone,
        "name": payload.name.strip(),
        "password_hash": hash_password(payload.password),
        "role": "user",
        "wallet_balance": 0.0,
        "bonus_balance": welcome,
        "total_earned": 0.0,
        "total_invested": 0.0,
        "referral_code": code,
        "referred_by": referred_by,
        "has_invested": False,
        "welcome_bonus_given": True,
        "created_at": now_utc().isoformat(),
    }
    res = await db.users.insert_one(doc)
    await add_transaction(res.inserted_id, "welcome_bonus", welcome, "Welcome bonus")

    access = create_access_token(str(res.inserted_id), "user")
    refresh = create_refresh_token(str(res.inserted_id))
    set_auth_cookies(response, access, refresh)
    user = await db.users.find_one({"_id": res.inserted_id})
    return {"user": clean(user), "access_token": access}


@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    phone = normalize_phone(payload.phone)
    user = await db.users.find_one({"phone": phone})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid phone or password")
    access = create_access_token(str(user["_id"]), user.get("role", "user"))
    refresh = create_refresh_token(str(user["_id"]))
    set_auth_cookies(response, access, refresh)
    return {"user": clean(user), "access_token": access}


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    user = await process_profit_drops(user)
    return clean(user)


# ---------------------------------------------------------------------------
# Products (public list + admin CRUD)
# ---------------------------------------------------------------------------
@api.get("/products")
async def list_products(user: dict = Depends(get_current_user)):
    query = {} if user.get("role") == "admin" else {"active": True}
    docs = await db.products.find(query).sort("price", 1).to_list(200)
    return [clean(d) for d in docs]


@api.post("/admin/products")
async def create_product(p: ProductIn, admin: dict = Depends(get_admin_user)):
    doc = p.model_dump()
    doc["created_at"] = now_utc().isoformat()
    res = await db.products.insert_one(doc)
    return clean(await db.products.find_one({"_id": res.inserted_id}))


@api.put("/admin/products/{pid}")
async def update_product(pid: str, p: ProductIn, admin: dict = Depends(get_admin_user)):
    await db.products.update_one({"_id": oid(pid)}, {"$set": p.model_dump()})
    return clean(await db.products.find_one({"_id": oid(pid)}))


@api.delete("/admin/products/{pid}")
async def delete_product(pid: str, admin: dict = Depends(get_admin_user)):
    await db.products.delete_one({"_id": oid(pid)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Investments
# ---------------------------------------------------------------------------
@api.post("/invest")
async def invest(payload: InvestIn, user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"_id": oid(payload.product_id), "active": True})
    if not product:
        raise HTTPException(404, "Product not found")
    price = float(product["price"])
    if user["wallet_balance"] < price:
        raise HTTPException(400, "Insufficient wallet balance. Please deposit funds.")

    # Deduct
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$inc": {"wallet_balance": -price, "total_invested": price},
         "$set": {"has_invested": True}},
    )
    inv_doc = {
        "user_id": user["_id"],
        "product_id": product["_id"],
        "product_name": product["name"],
        "price": price,
        "daily_profit_pct": float(product["daily_profit_pct"]),
        "duration_days": int(product["duration_days"]),
        "drops_done": 0,
        "total_earned": 0.0,
        "status": "active",
        "created_at": now_utc().isoformat(),
        "last_drop_at": now_utc().isoformat(),
    }
    res = await db.investments.insert_one(inv_doc)
    await add_transaction(user["_id"], "investment", -price,
                          f"Invested in {product['name']}", {"investment_id": str(res.inserted_id)})

    # Referral commissions
    settings = await get_settings()
    pcts = [settings["referral_gen1_pct"], settings["referral_gen2_pct"], settings["referral_gen3_pct"]]
    current_ref = user.get("referred_by")
    for gen, pct in enumerate(pcts, start=1):
        if not current_ref:
            break
        ref_user = await db.users.find_one({"_id": current_ref})
        if not ref_user:
            break
        commission = price * (pct / 100.0)
        if commission > 0:
            await db.users.update_one(
                {"_id": ref_user["_id"]},
                {"$inc": {"wallet_balance": commission, "total_earned": commission}},
            )
            await add_transaction(
                ref_user["_id"], "referral", commission,
                f"Gen {gen} referral commission ({pct}%) from {user['name']}",
                {"generation": gen, "from_user": str(user["_id"])},
            )
        current_ref = ref_user.get("referred_by")

    return clean(await db.investments.find_one({"_id": res.inserted_id}))


@api.get("/investments")
async def my_investments(user: dict = Depends(get_current_user)):
    user = await process_profit_drops(user)
    docs = await db.investments.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(500)
    out = []
    for d in docs:
        d["id"] = str(d.pop("_id"))
        d["user_id"] = str(d["user_id"])
        d["product_id"] = str(d["product_id"])
        out.append(d)
    return out


# ---------------------------------------------------------------------------
# Deposits
# ---------------------------------------------------------------------------
@api.get("/payment-accounts")
async def user_payment_accounts(user: dict = Depends(get_current_user)):
    docs = await db.payment_accounts.find({"active": True}).to_list(50)
    return [clean(d) for d in docs]


@api.post("/deposits")
async def create_deposit(payload: DepositCreateIn, user: dict = Depends(get_current_user)):
    settings = await get_settings()
    if payload.amount < settings["min_deposit"]:
        raise HTTPException(400, f"Minimum deposit is ₦{settings['min_deposit']:.0f}")
    doc = {
        "user_id": user["_id"],
        "user_name": user["name"],
        "user_phone": user["phone"],
        "amount": float(payload.amount),
        "method": payload.method,
        "reference": payload.reference or "",
        "status": "pending",
        "created_at": now_utc().isoformat(),
    }
    res = await db.deposits.insert_one(doc)
    return clean(await db.deposits.find_one({"_id": res.inserted_id}))


@api.get("/deposits")
async def my_deposits(user: dict = Depends(get_current_user)):
    docs = await db.deposits.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(200)
    return [clean(d) | {"user_id": str(d["user_id"])} for d in docs]


# ---------------------------------------------------------------------------
# Withdrawals
# ---------------------------------------------------------------------------
@api.post("/withdrawals")
async def create_withdrawal(payload: WithdrawCreateIn, user: dict = Depends(get_current_user)):
    if not user.get("has_invested"):
        raise HTTPException(400, "You must invest first before withdrawing")
    settings = await get_settings()
    if payload.amount < settings["min_withdrawal"]:
        raise HTTPException(400, f"Minimum withdrawal is ₦{settings['min_withdrawal']:.0f}")
    if payload.amount > user["wallet_balance"]:
        raise HTTPException(400, "Insufficient balance")
    # Hold the funds
    await db.users.update_one({"_id": user["_id"]}, {"$inc": {"wallet_balance": -payload.amount}})
    doc = {
        "user_id": user["_id"],
        "user_name": user["name"],
        "user_phone": user["phone"],
        "amount": float(payload.amount),
        "bank_name": payload.bank_name,
        "account_number": payload.account_number,
        "account_name": payload.account_name,
        "status": "pending",
        "created_at": now_utc().isoformat(),
    }
    res = await db.withdrawals.insert_one(doc)
    await add_transaction(user["_id"], "withdrawal_hold", -payload.amount,
                          "Withdrawal requested (pending)", {"withdrawal_id": str(res.inserted_id)})
    return clean(await db.withdrawals.find_one({"_id": res.inserted_id}))


@api.get("/withdrawals")
async def my_withdrawals(user: dict = Depends(get_current_user)):
    docs = await db.withdrawals.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(200)
    return [clean(d) | {"user_id": str(d["user_id"])} for d in docs]


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
@api.get("/transactions")
async def my_transactions(user: dict = Depends(get_current_user)):
    docs = await db.transactions.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(500)
    return [clean(d) | {"user_id": str(d["user_id"])} for d in docs]


# ---------------------------------------------------------------------------
# Referrals
# ---------------------------------------------------------------------------
@api.get("/referrals")
async def my_referrals(user: dict = Depends(get_current_user)):
    settings = await get_settings()
    gen1_docs = await db.users.find({"referred_by": user["_id"]}).to_list(1000)
    gen1_ids = [u["_id"] for u in gen1_docs]
    gen2_docs = await db.users.find({"referred_by": {"$in": gen1_ids}}).to_list(1000) if gen1_ids else []
    gen2_ids = [u["_id"] for u in gen2_docs]
    gen3_docs = await db.users.find({"referred_by": {"$in": gen2_ids}}).to_list(1000) if gen2_ids else []

    def shape(u):
        return {"id": str(u["_id"]), "name": u["name"], "phone": u["phone"][-4:].rjust(len(u["phone"]), "*"),
                "has_invested": u.get("has_invested", False), "joined_at": u.get("created_at")}

    # Total commissions
    tx = await db.transactions.find({"user_id": user["_id"], "type": "referral"}).to_list(2000)
    totals = {1: 0.0, 2: 0.0, 3: 0.0}
    for t in tx:
        g = (t.get("meta") or {}).get("generation")
        if g in totals:
            totals[g] += t["amount"]
    return {
        "referral_code": user["referral_code"],
        "gen1_pct": settings["referral_gen1_pct"],
        "gen2_pct": settings["referral_gen2_pct"],
        "gen3_pct": settings["referral_gen3_pct"],
        "gen1": [shape(u) for u in gen1_docs],
        "gen2": [shape(u) for u in gen2_docs],
        "gen3": [shape(u) for u in gen3_docs],
        "earnings": {"gen1": totals[1], "gen2": totals[2], "gen3": totals[3],
                     "total": totals[1] + totals[2] + totals[3]},
    }


# ---------------------------------------------------------------------------
# Coupon codes
# ---------------------------------------------------------------------------
@api.post("/coupons/redeem")
async def redeem_coupon(payload: CouponRedeemIn, user: dict = Depends(get_current_user)):
    if not user.get("has_invested"):
        raise HTTPException(400, "You must invest before redeeming a coupon")
    code = payload.code.upper().strip()
    coupon = await db.coupons.find_one({"code": code, "active": True})
    if not coupon:
        raise HTTPException(404, "Invalid or inactive coupon code")
    used_by = coupon.get("used_by", [])
    if user["_id"] in used_by:
        raise HTTPException(400, "You already redeemed this coupon")
    if len(used_by) >= coupon["max_uses"]:
        raise HTTPException(400, "This coupon has reached its usage limit")
    amount = float(coupon["amount"])
    await db.coupons.update_one({"_id": coupon["_id"]}, {"$push": {"used_by": user["_id"]}})
    await db.users.update_one({"_id": user["_id"]},
                              {"$inc": {"wallet_balance": amount, "total_earned": amount}})
    await add_transaction(user["_id"], "coupon", amount, f"Redeemed coupon {code}")
    return {"ok": True, "amount": amount}


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
@api.get("/admin/stats")
async def admin_stats(admin: dict = Depends(get_admin_user)):
    total_users = await db.users.count_documents({"role": "user"})
    invested_users = await db.users.count_documents({"has_invested": True})
    pending_deposits = await db.deposits.count_documents({"status": "pending"})
    pending_withdrawals = await db.withdrawals.count_documents({"status": "pending"})

    async def sum_field(coll, match, field):
        cur = coll.aggregate([{"$match": match}, {"$group": {"_id": None, "s": {"$sum": f"${field}"}}}])
        async for r in cur:
            return float(r["s"])
        return 0.0

    total_deposited = await sum_field(db.deposits, {"status": "approved"}, "amount")
    total_withdrawn = await sum_field(db.withdrawals, {"status": "approved"}, "amount")
    total_invested = await sum_field(db.investments, {}, "price")
    total_profit_paid = await sum_field(db.transactions, {"type": "profit"}, "amount")
    return {
        "total_users": total_users,
        "invested_users": invested_users,
        "pending_deposits": pending_deposits,
        "pending_withdrawals": pending_withdrawals,
        "total_deposited": total_deposited,
        "total_withdrawn": total_withdrawn,
        "total_invested": total_invested,
        "total_profit_paid": total_profit_paid,
    }


@api.get("/admin/users")
async def admin_list_users(admin: dict = Depends(get_admin_user), q: Optional[str] = Query(None)):
    query: dict = {"role": "user"}
    if q:
        query["$or"] = [
            {"phone": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.users.find(query).sort("created_at", -1).to_list(500)
    return [clean(d) for d in docs]


@api.get("/admin/users/{uid}")
async def admin_get_user(uid: str, admin: dict = Depends(get_admin_user)):
    u = await db.users.find_one({"_id": oid(uid)})
    if not u:
        raise HTTPException(404, "User not found")
    tx = await db.transactions.find({"user_id": u["_id"]}).sort("created_at", -1).to_list(200)
    invs = await db.investments.find({"user_id": u["_id"]}).sort("created_at", -1).to_list(200)
    return {
        "user": clean(u),
        "transactions": [clean(t) | {"user_id": str(t["user_id"])} for t in tx],
        "investments": [(lambda d: {**d, "id": str(d.pop("_id")), "user_id": str(d["user_id"]),
                                    "product_id": str(d["product_id"])})(dict(i)) for i in invs],
    }


@api.post("/admin/users/{uid}/add-balance")
async def admin_add_balance(uid: str, payload: AddBalanceIn, admin: dict = Depends(get_admin_user)):
    if payload.amount == 0:
        raise HTTPException(400, "Amount cannot be zero")
    u = await db.users.find_one({"_id": oid(uid)})
    if not u:
        raise HTTPException(404, "User not found")
    await db.users.update_one({"_id": u["_id"]}, {"$inc": {"wallet_balance": payload.amount}})
    await add_transaction(u["_id"], "admin_credit", payload.amount, payload.note or "Admin credit",
                          {"admin_id": str(admin["_id"])})
    u = await db.users.find_one({"_id": u["_id"]})
    return {"ok": True, "user": clean(u)}


# Deposits admin
@api.get("/admin/deposits")
async def admin_deposits(admin: dict = Depends(get_admin_user), status: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    docs = await db.deposits.find(query).sort("created_at", -1).to_list(500)
    return [clean(d) | {"user_id": str(d["user_id"])} for d in docs]


@api.post("/admin/deposits/{did}/approve")
async def approve_deposit(did: str, payload: ApprovalIn, admin: dict = Depends(get_admin_user)):
    dep = await db.deposits.find_one({"_id": oid(did)})
    if not dep:
        raise HTTPException(404, "Deposit not found")
    if dep["status"] != "pending":
        raise HTTPException(400, f"Already {dep['status']}")
    await db.deposits.update_one({"_id": dep["_id"]},
                                 {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                                           "admin_note": payload.note or ""}})
    await db.users.update_one({"_id": dep["user_id"]}, {"$inc": {"wallet_balance": dep["amount"]}})
    await add_transaction(dep["user_id"], "deposit", dep["amount"], "Deposit approved",
                          {"deposit_id": str(dep["_id"])})
    return {"ok": True}


@api.post("/admin/deposits/{did}/reject")
async def reject_deposit(did: str, payload: ApprovalIn, admin: dict = Depends(get_admin_user)):
    dep = await db.deposits.find_one({"_id": oid(did)})
    if not dep:
        raise HTTPException(404, "Deposit not found")
    if dep["status"] != "pending":
        raise HTTPException(400, f"Already {dep['status']}")
    await db.deposits.update_one({"_id": dep["_id"]},
                                 {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                                           "admin_note": payload.note or ""}})
    return {"ok": True}


# Withdrawals admin
@api.get("/admin/withdrawals")
async def admin_withdrawals(admin: dict = Depends(get_admin_user), status: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    docs = await db.withdrawals.find(query).sort("created_at", -1).to_list(500)
    return [clean(d) | {"user_id": str(d["user_id"])} for d in docs]


@api.post("/admin/withdrawals/{wid}/approve")
async def approve_withdrawal(wid: str, payload: ApprovalIn, admin: dict = Depends(get_admin_user)):
    w = await db.withdrawals.find_one({"_id": oid(wid)})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(400, f"Already {w['status']}")
    await db.withdrawals.update_one({"_id": w["_id"]},
                                    {"$set": {"status": "approved", "processed_at": now_utc().isoformat(),
                                              "admin_note": payload.note or ""}})
    await add_transaction(w["user_id"], "withdrawal", -w["amount"], "Withdrawal approved",
                          {"withdrawal_id": str(w["_id"])})
    return {"ok": True}


@api.post("/admin/withdrawals/{wid}/reject")
async def reject_withdrawal(wid: str, payload: ApprovalIn, admin: dict = Depends(get_admin_user)):
    w = await db.withdrawals.find_one({"_id": oid(wid)})
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    if w["status"] != "pending":
        raise HTTPException(400, f"Already {w['status']}")
    # Refund held amount
    await db.users.update_one({"_id": w["user_id"]}, {"$inc": {"wallet_balance": w["amount"]}})
    await db.withdrawals.update_one({"_id": w["_id"]},
                                    {"$set": {"status": "rejected", "processed_at": now_utc().isoformat(),
                                              "admin_note": payload.note or ""}})
    await add_transaction(w["user_id"], "withdrawal_refund", w["amount"], "Withdrawal rejected - refunded",
                          {"withdrawal_id": str(w["_id"])})
    return {"ok": True}


# Payment accounts admin
@api.get("/admin/payment-accounts")
async def admin_list_accounts(admin: dict = Depends(get_admin_user)):
    docs = await db.payment_accounts.find({}).sort("created_at", -1).to_list(100)
    return [clean(d) for d in docs]


@api.post("/admin/payment-accounts")
async def create_account(p: AccountIn, admin: dict = Depends(get_admin_user)):
    doc = p.model_dump()
    doc["created_at"] = now_utc().isoformat()
    res = await db.payment_accounts.insert_one(doc)
    return clean(await db.payment_accounts.find_one({"_id": res.inserted_id}))


@api.put("/admin/payment-accounts/{aid}")
async def update_account(aid: str, p: AccountIn, admin: dict = Depends(get_admin_user)):
    await db.payment_accounts.update_one({"_id": oid(aid)}, {"$set": p.model_dump()})
    return clean(await db.payment_accounts.find_one({"_id": oid(aid)}))


@api.delete("/admin/payment-accounts/{aid}")
async def delete_account(aid: str, admin: dict = Depends(get_admin_user)):
    await db.payment_accounts.delete_one({"_id": oid(aid)})
    return {"ok": True}


# Coupons admin
@api.get("/admin/coupons")
async def admin_list_coupons(admin: dict = Depends(get_admin_user)):
    docs = await db.coupons.find({}).sort("created_at", -1).to_list(200)
    out = []
    for d in docs:
        d = clean(d)
        d["used_by"] = [str(x) for x in d.get("used_by", [])]
        d["used_count"] = len(d["used_by"])
        out.append(d)
    return out


@api.post("/admin/coupons")
async def create_coupon(p: CouponIn, admin: dict = Depends(get_admin_user)):
    code = p.code.upper().strip()
    if await db.coupons.find_one({"code": code}):
        raise HTTPException(400, "Coupon code already exists")
    doc = {"code": code, "amount": p.amount, "max_uses": p.max_uses, "active": p.active,
           "used_by": [], "created_at": now_utc().isoformat()}
    res = await db.coupons.insert_one(doc)
    d = clean(await db.coupons.find_one({"_id": res.inserted_id}))
    d["used_by"] = []
    return d


@api.put("/admin/coupons/{cid}")
async def update_coupon(cid: str, p: CouponIn, admin: dict = Depends(get_admin_user)):
    await db.coupons.update_one({"_id": oid(cid)},
                                {"$set": {"code": p.code.upper().strip(), "amount": p.amount,
                                          "max_uses": p.max_uses, "active": p.active}})
    return {"ok": True}


@api.delete("/admin/coupons/{cid}")
async def delete_coupon(cid: str, admin: dict = Depends(get_admin_user)):
    await db.coupons.delete_one({"_id": oid(cid)})
    return {"ok": True}


# Settings admin
@api.get("/admin/settings")
async def admin_get_settings(admin: dict = Depends(get_admin_user)):
    s = await get_settings()
    s.pop("_id", None)
    return s


@api.put("/admin/settings")
async def admin_update_settings(payload: SettingsIn, admin: dict = Depends(get_admin_user)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await db.settings.update_one({"_id": "global"}, {"$set": updates}, upsert=True)
    s = await get_settings()
    s.pop("_id", None)
    return s


# ---------------------------------------------------------------------------
# Router mount + CORS
# ---------------------------------------------------------------------------
app.include_router(api)

frontend_origin = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@api.get("/")
async def health():
    return {"ok": True, "service": "naija-invest"}
