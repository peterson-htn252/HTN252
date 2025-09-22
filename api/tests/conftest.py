import os
import sys
import types
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))

# Ensure required environment variables are populated before importing the code under test.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "public-anon-key")
os.environ.setdefault("SECRET_KEY", "unit-test-secret")
os.environ.setdefault("XRPL_RPC_URL", "https://xrpl.invalid")
os.environ.setdefault("XRPL_NETWORK", "TESTNET")
os.environ.setdefault("XRPL_USD_RATE", "2.0")



# Provide a minimal python-dotenv stub when the dependency is missing.
try:  # pragma: no cover
    import dotenv  # type: ignore  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover
    dotenv_stub = types.ModuleType("dotenv")

    def load_dotenv(*args, **kwargs):
        return False

    dotenv_stub.load_dotenv = load_dotenv
    sys.modules["dotenv"] = dotenv_stub

# Provide a lightweight stub for FastAPI when the real dependency is unavailable.
try:  # pragma: no cover - exercised only when FastAPI is installed.
    import fastapi  # type: ignore  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover - executed in the test environment.
    fastapi_stub = types.ModuleType("fastapi")

    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: str):
            self.status_code = status_code
            self.detail = detail
            super().__init__(detail)

    def Depends(dependency=None):
        return dependency

    class FastAPI:
        def __init__(self, *args, **kwargs):
            pass

        def add_middleware(self, *args, **kwargs):
            pass

        def include_router(self, *args, **kwargs):
            pass

    fastapi_stub.HTTPException = HTTPException
    fastapi_stub.Depends = Depends
    fastapi_stub.FastAPI = FastAPI
    sys.modules["fastapi"] = fastapi_stub


# Provide a small xrpl-py stub so ``core.xrpl`` can be imported without the heavy dependency.
try:  # pragma: no cover - exercised only when xrpl is installed.
    import xrpl  # type: ignore  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover - executed in the test environment.
    xrpl_module = types.ModuleType("xrpl")

    transaction_module = types.ModuleType("xrpl.transaction")

    def _not_implemented(*args, **kwargs):  # pragma: no cover - defensive
        raise NotImplementedError("xrpl transaction stub invoked")

    transaction_module.autofill_and_sign = _not_implemented
    transaction_module.safe_sign_and_autofill_transaction = _not_implemented
    transaction_module.autofill = lambda tx, client: tx
    transaction_module.sign = lambda tx, wallet: tx

    class _SubmitResponse:
        def __init__(self):
            self.result = {"tx_json": {"hash": "stub-hash"}}

    def submit(tx, client):  # pragma: no cover - defensive
        return _SubmitResponse()

    def submit_and_wait(tx, client, wallet=None):  # pragma: no cover - defensive
        return _SubmitResponse()

    transaction_module.submit = submit
    transaction_module.submit_and_wait = submit_and_wait

    clients_module = types.ModuleType("xrpl.clients")

    class JsonRpcClient:
        def __init__(self, url):
            self.url = url

        def request(self, _request):  # pragma: no cover - defensive
            return types.SimpleNamespace(result={"validated": True})

    clients_module.JsonRpcClient = JsonRpcClient

    core_module = types.ModuleType("xrpl.core")
    keypairs_module = types.ModuleType("xrpl.core.keypairs")

    def derive_classic_address(public_key: str) -> str:
        return f"classic-{public_key}"

    keypairs_module.derive_classic_address = derive_classic_address

    models_module = types.ModuleType("xrpl.models")
    requests_module = types.ModuleType("xrpl.models.requests")

    class AccountInfo:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class Tx:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    requests_module.AccountInfo = AccountInfo
    requests_module.Tx = Tx

    transactions_module = types.ModuleType("xrpl.models.transactions")

    @dataclass
    class Memo:
        memo_type: str | None = None
        memo_data: str | None = None

    class Payment:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    transactions_module.Memo = Memo
    transactions_module.Payment = Payment

    wallet_module = types.ModuleType("xrpl.wallet")

    class Wallet:
        def __init__(self, seed: str | None = None, address: str | None = None):
            self.seed = seed
            self.address = address

    def generate_faucet_wallet(*args, **kwargs):  # pragma: no cover - defensive
        return Wallet(seed="faucet-seed", address="classic-seed")

    wallet_module.Wallet = Wallet
    wallet_module.generate_faucet_wallet = generate_faucet_wallet

    xrpl_module.transaction = transaction_module
    xrpl_module.clients = clients_module
    xrpl_module.core = core_module
    xrpl_module.models = models_module
    xrpl_module.wallet = wallet_module

    sys.modules["xrpl"] = xrpl_module
    sys.modules["xrpl.transaction"] = transaction_module
    sys.modules["xrpl.clients"] = clients_module
    sys.modules["xrpl.core"] = core_module
    sys.modules["xrpl.core.keypairs"] = keypairs_module
    sys.modules["xrpl.models"] = models_module
    sys.modules["xrpl.models.requests"] = requests_module
    sys.modules["xrpl.models.transactions"] = transactions_module
    sys.modules["xrpl.wallet"] = wallet_module

    models_module.requests = requests_module
    models_module.transactions = transactions_module
    core_module.keypairs = keypairs_module
