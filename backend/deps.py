"""Shared FastAPI dependencies + helpers: JWT, hashing, auth deps, settings, transactions."""
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
from bson import ObjectId
from fastapi import Depends, HTTPException, Request, Response

from db import db

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24  # 1 day
REFRESH_TOKEN_DAYS = 7


# ------------------ hashing ------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ------------------ jwt ------------------
def _jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, role: str) -> str:
    payload = {"sub": user_id, "role": role, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)}
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh",
               "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS)}
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                        max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                        max_age=REFRESH_TOKEN_DAYS * 86400, path="/")


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


# ------------------ misc helpers ------------------
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


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")


def clean(doc: Optional[dict]) -> Optional[dict]:
    """Convert a MongoDB doc into a JSON-serialisable dict for API responses."""
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    for k, v in list(doc.items()):
        if isinstance(v, ObjectId):
            doc[k] = str(v)
        elif isinstance(v, list):
            doc[k] = [str(x) if isinstance(x, ObjectId) else x for x in v]
    return doc


# ------------------ auth deps ------------------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
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


# ------------------ settings ------------------
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
    for k, v in DEFAULT_SETTINGS.items():
        if k not in s:
            s[k] = v
    return s


# ------------------ transactions ------------------
async def add_transaction(user_id: ObjectId, tx_type: str, amount: float,
                          note: str = "", meta: Optional[dict] = None) -> None:
    await db.transactions.insert_one({
        "user_id": user_id,
        "type": tx_type,
        "amount": float(amount),
        "note": note,
        "meta": meta or {},
        "created_at": now_utc().isoformat(),
    })
