"""Pydantic request/response schemas."""
from typing import Optional
from pydantic import BaseModel


class RegisterIn(BaseModel):
    phone: str
    password: str
    name: str
    referral_code: Optional[str] = None


class LoginIn(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
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
    method: str
    reference: Optional[str] = ""


class WithdrawCreateIn(BaseModel):
    amount: float
    bank_name: str
    account_number: str
    account_name: str
    bank_code: Optional[str] = None


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


class VerifyAccountIn(BaseModel):
    bank_code: str
    account_number: str
