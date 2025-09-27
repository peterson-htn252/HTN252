from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
import jwt

from .config import JWT_SECRET, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_HOURS
from .database import TBL_NGOS

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        ngo_id: str = payload.get("sub")
        if not ngo_id:
            raise HTTPException(401, "Invalid authentication credentials")
        return payload
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(401, "Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(401, "Invalid token") from exc


def get_current_ngo(token_data: dict = Depends(verify_token)) -> dict:
    ngo_id = token_data.get("sub")
    try:
        ngo = TBL_NGOS.get_item(Key={"ngo_id": ngo_id}).get("Item")
        if not ngo:
            raise HTTPException(status_code=404, detail="NGO not found")
        return ngo
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Database error") from exc
