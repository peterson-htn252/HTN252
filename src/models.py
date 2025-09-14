from typing import Optional, Literal, Dict, List
from pydantic import BaseModel, Field, conint, EmailStr

AccountType = Literal["NGO", "RECIPIENT"]


class AccountCreate(BaseModel):
    account_type: AccountType
    status: Literal["active", "blocked"] = "active"
    name: str
    email: str
    password: str
    ngo_id: Optional[str] = None
    goal: Optional[str] = None
    description: Optional[str] = None


class AccountLogin(BaseModel):
    email: str
    password: str


class WalletLinkStart(BaseModel):
    address: str


class WalletLinkConfirm(BaseModel):
    address: str
    signature: str


class QuoteRequest(BaseModel):
    from_currency: str = Field(..., examples=["XRP"])  # logical from
    to_currency: str = Field(..., examples=["PHP"])    # to fiat
    amount_minor: conint(gt=0)


class RedeemBody(BaseModel):
    voucher_id: str
    store_id: str
    recipient_id: str
    program_id: str
    amount_minor: conint(gt=0)
    currency: str


class StorePayoutMethod(BaseModel):
    method: Literal["bank_transfer", "mobile_money"]
    currency: str
    detail: Dict[str, str]


class StorePayoutBody(BaseModel):
    store_id: str
    program_id: str
    amount_minor: conint(gt=0)
    currency: str


Role = Literal["NGO", "STORE", "RECIPIENT", "DONOR"]


class VCIssue(BaseModel):
    issuer_did: str
    subject_wallet: Optional[str] = None
    subject_id: Optional[str] = None
    role: Role
    program_id: Optional[str] = None
    ttl_minutes: int = 365*24*60


class VCVerify(BaseModel):
    jwt: str


class VCRevoke(BaseModel):
    credential_id: str


class NGORegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    organization_name: str
    contact_name: str
    goal: str
    description: str


class NGOLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    ngo_id: str
    organization_name: str


class AccountToken(BaseModel):
    access_token: str
    token_type: str
    account_id: str
    account_type: str


class NGOAccountSummary(BaseModel):
    account_id: str
    name: str
    description: str
    goal: str
    status: str
    lifetime_donations: int
    created_at: str


class RecipientCreate(BaseModel):
    name: str
    location: str
    category: str = Field(..., examples=["Family Aid", "Medical Support", "Education", "Emergency Relief"])
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    program_id: str


class RecipientUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    category: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    status: Optional[Literal["active", "pending", "inactive"]] = None


class BalanceOperation(BaseModel):
    amount_minor: conint(gt=0)
    operation_type: Literal["deposit", "withdraw"]
    description: Optional[str] = None
    program_id: str


class DonationCreate(BaseModel):
    donor_name: str
    donor_email: Optional[EmailStr] = None
    amount_minor: conint(gt=0)
    currency: str = "USD"
    program_id: str
    description: Optional[str] = None


class ExpenseCreate(BaseModel):
    category: str = Field(..., examples=["Food Aid", "Medical Support", "Education", "Emergency Relief", "Infrastructure"])
    amount_minor: conint(gt=0)
    currency: str = "USD"
    program_id: str
    description: str
    recipient_id: Optional[str] = None
