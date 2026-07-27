"""Authentication endpoints: register, login (email or phone), logout, me."""
from fastapi import APIRouter, HTTPException, Depends, Response

from db import db, logger
from deps import (
    normalize_phone, valid_phone, gen_referral_code, now_utc, clean,
    hash_password, verify_password, create_access_token, create_refresh_token,
    set_auth_cookies, clear_auth_cookies, get_current_user, get_settings, add_transaction,
)
from schemas import RegisterIn, LoginIn

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
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


@router.post("/login")
async def login(payload: LoginIn, response: Response):
    identifier = (payload.email or payload.phone or "").strip()
    if not identifier or not payload.password:
        raise HTTPException(400, "Email/phone and password required")
    if "@" in identifier:
        user = await db.users.find_one({"email": identifier.lower()})
    else:
        phone = normalize_phone(identifier)
        user = await db.users.find_one({"phone": phone})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    access = create_access_token(str(user["_id"]), user.get("role", "user"))
    refresh = create_refresh_token(str(user["_id"]))
    set_auth_cookies(response, access, refresh)
    return {"user": clean(user), "access_token": access}


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    from routers.wallet_ops import process_profit_drops  # local import to avoid cycle
    user = await process_profit_drops(user)
    return clean(user)
