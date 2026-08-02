from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Form, Response, Request
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne, ReturnDocument
import os
import asyncio
import time
import logging
import requests
import re
from urllib.parse import quote_plus
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from twilio.rest import Client as TwilioClient
import google_sheets as gs
import secrets as _secrets
import hmac as _hmac
import hashlib as _hashlib


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# --- Background task retention (Fix: dropped-task GC) ---
_BG_TASKS: "set[asyncio.Task]" = set()


def _schedule_bg(coro, name: str = "bg"):
    """Fire-and-forget an awaitable but keep a strong ref so the loop can't GC it,
    and log any exception it raises."""
    task = asyncio.create_task(coro, name=name)
    _BG_TASKS.add(task)
    def _done(t):
        _BG_TASKS.discard(t)
        exc = t.exception()
        if exc:
            logger.error("Background task %s failed: %s", t.get_name(), exc)
    task.add_done_callback(_done)
    return task


# --- Signed URLs for job-proof photos (privacy: browsers can't add auth headers to <img>) ---
_PROOF_URL_SECRET_ENV = os.environ.get("PROOF_URL_SECRET")
if not _PROOF_URL_SECRET_ENV:
    logging.getLogger(__name__).warning(
        "PROOF_URL_SECRET is not set — signed proof URLs will use an ephemeral key that resets "
        "on every restart and differs between workers. Set a stable value in backend/.env."
    )
_PROOF_URL_SECRET = _PROOF_URL_SECRET_ENV or _secrets.token_urlsafe(48)
_PROOF_URL_TTL_SECONDS = 60 * 60  # 1h — long enough for admin/cleaner to browse, short enough that leaked URLs expire


def _sign_proof(path: str, expires_at: int) -> str:
    msg = f"{path}|{expires_at}".encode()
    return _hmac.new(_PROOF_URL_SECRET.encode(), msg, _hashlib.sha256).hexdigest()[:32]


def _apply_proof_signature(url: str) -> str:
    """If `url` points at a job-proof photo, append `?sig=…&exp=…`."""
    if not url or "/proof/" not in url:
        return url
    # url looks like /api/app-images/file/{path}
    prefix = "/api/app-images/file/"
    if not url.startswith(prefix):
        return url
    path = url[len(prefix):]
    exp = int(time.time()) + _PROOF_URL_TTL_SECONDS
    sig = _sign_proof(path, exp)
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}sig={sig}&exp={exp}"


def _proof_sig_ok(path: str, sig: Optional[str], exp: Optional[str]) -> bool:
    if not sig or not exp:
        return False
    try:
        exp_int = int(exp)
    except (TypeError, ValueError):
        return False
    if exp_int < int(time.time()):
        return False
    return _hmac.compare_digest(sig, _sign_proof(path, exp_int))

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------------- Object Storage ----------------
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "tidyups-quote"
MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}
_storage_key = None


def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------- Models ----------------
class QuoteCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    service_type: str
    property_type: Optional[str] = None
    bedrooms: Optional[str] = None
    bathrooms: Optional[str] = None
    address: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    preferred_date: Optional[str] = None
    message: Optional[str] = None


class Quote(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    email: Optional[str] = None
    service_type: str
    property_type: Optional[str] = None
    bedrooms: Optional[str] = None
    bathrooms: Optional[str] = None
    address: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    preferred_date: Optional[str] = None
    message: Optional[str] = None
    status: str = "new"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# section: "hero" | "gallery" | "why"
WHY_IMAGE_URL = "https://customer-assets.emergentagent.com/job_tidyups-quote/artifacts/ysqa7ta1_Weekend%20Plans.jpg"

SEED_IMAGES = [
    {"section": "hero", "label": "Our Fleet", "order": 0,
     "url": "https://customer-assets.emergentagent.com/job_tidyups-quote/artifacts/pdg75ki2_branded%20vehicles.png"},
    {"section": "why", "label": "Why Tidyups", "order": 0, "url": WHY_IMAGE_URL},
    {"section": "gallery", "label": "Serving Edmonton", "order": 0,
     "url": "https://customer-assets.emergentagent.com/job_tidyups-quote/artifacts/nencmbh4_edmonton%20branded%20vehicles%20v01.jpg"},
    {"section": "gallery", "label": "Home & Office Service", "order": 1,
     "url": "https://customer-assets.emergentagent.com/job_tidyups-quote/artifacts/rqszupss_tidyups%20vehicle%20in%20front%20of%20house.png"},
    {"section": "gallery", "label": "Our Team", "order": 2,
     "url": "https://customer-assets.emergentagent.com/job_tidyups-quote/artifacts/9zhnpwav_Jen%20%26%20Bryan%20V001_edited600x600.jpg"},
    {"section": "gallery", "label": "On The Road", "order": 3,
     "url": "https://customer-assets.emergentagent.com/job_tidyups-quote/artifacts/a95j1stt_vehicle%20in%20edmonton.png"},
]


async def seed_site_images():
    count = await db.site_images.count_documents({})
    if count == 0:
        docs = []
        for s in SEED_IMAGES:
            docs.append({
                "id": str(uuid.uuid4()),
                "section": s["section"],
                "label": s["label"],
                "order": s["order"],
                "url": s["url"],
                "storage_path": None,
                "is_deleted": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        await db.site_images.insert_many(docs)
        logger.info("Seeded %d site images", len(docs))
    # Ensure the "why" slot exists for databases seeded before it was added.
    why_exists = await db.site_images.count_documents({"section": "why", "is_deleted": False})
    if why_exists == 0:
        await db.site_images.insert_one({
            "id": str(uuid.uuid4()),
            "section": "why",
            "label": "Why Tidyups",
            "order": 0,
            "url": WHY_IMAGE_URL,
            "storage_path": None,
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Ensured 'why' site image")
    # Ensure the "hero" slot exists too (self-heal if soft-deleted).
    hero_exists = await db.site_images.count_documents({"section": "hero", "is_deleted": False})
    if hero_exists == 0:
        hero_seed = SEED_IMAGES[0]
        await db.site_images.insert_one({
            "id": str(uuid.uuid4()),
            "section": "hero",
            "label": hero_seed["label"],
            "order": 0,
            "url": hero_seed["url"],
            "storage_path": None,
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Ensured 'hero' site image")


# ---------------- Routes ----------------
@api_router.get("/")
async def root():
    return {"message": "Tidyups Cleaning API"}


def _send_lead_sms(quote: "Quote"):
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_number = os.environ.get("TWILIO_FROM_NUMBER")
    to_number = os.environ.get("LEAD_ALERT_TO")
    if not all([sid, token, from_number, to_number]):
        logger.warning("Twilio not fully configured; skipping SMS alert")
        return
    parts = [
        "New Tidyups lead!",
        f"Name: {quote.name}",
        f"Phone: {quote.phone}",
        f"Service: {quote.service_type}",
    ]
    if quote.bedrooms or quote.bathrooms:
        parts.append(f"Beds/Baths: {quote.bedrooms or '-'}/{quote.bathrooms or '-'}")
    addr_bits = [b for b in [quote.street_address, quote.city, quote.province, quote.postal_code] if b]
    if addr_bits:
        parts.append(f"Address: {', '.join(addr_bits)}")
    elif quote.address:
        parts.append(f"Area: {quote.address}")
    body = "\n".join(parts)
    try:
        tclient = TwilioClient(sid, token)
        tclient.messages.create(body=body, from_=from_number, to=to_number)
        logger.info("Lead SMS sent to %s", to_number)
    except Exception as e:
        logger.error("Failed to send lead SMS: %s", e)


@api_router.post("/quotes", response_model=Quote)
async def create_quote(payload: QuoteCreate):
    quote = Quote(**payload.model_dump())
    await db.quotes.insert_one(quote.model_dump())
    try:
        _send_lead_sms(quote)
    except Exception as e:
        logger.error("SMS alert error: %s", e)
    _schedule_bg(_sync_quote_to_sheet(quote), name="sync-sheet")
    return quote


ADMIN_PW_CACHE = {"value": os.environ.get('ADMIN_PASSWORD')}


async def _load_admin_password():
    doc = await db.app_settings.find_one({"key": "security"})
    if doc and doc.get("admin_password"):
        ADMIN_PW_CACHE["value"] = doc["admin_password"]


def _check_admin(password: Optional[str]):
    expected = ADMIN_PW_CACHE["value"]
    if not expected or not password or not _secrets.compare_digest(str(password), str(expected)):
        raise HTTPException(status_code=401, detail="Invalid admin password")


@api_router.get("/quotes", response_model=List[Quote])
async def list_quotes(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    quotes = await db.quotes.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return quotes


@api_router.post("/admin/login")
async def admin_login(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    return {"ok": True}


class AdminPasswordUpdate(BaseModel):
    new_password: str


@api_router.put("/admin/password")
async def change_admin_password(payload: AdminPasswordUpdate, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    new_pw = payload.new_password.strip()
    if len(new_pw) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    await db.app_settings.update_one({"key": "security"}, {"$set": {"admin_password": new_pw}}, upsert=True)
    ADMIN_PW_CACHE["value"] = new_pw
    return {"ok": True}


PRODUCTION_API_URL = os.environ.get('PRODUCTION_API_URL', '').rstrip('/')
PRODUCTION_ADMIN_PASSWORD = os.environ.get('PRODUCTION_ADMIN_PASSWORD', '')


@api_router.get("/leads")
async def proxy_leads(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    if not PRODUCTION_API_URL:
        raise HTTPException(status_code=500, detail="Leads source not configured")

    def _fetch():
        return requests.get(
            f"{PRODUCTION_API_URL}/api/quotes",
            headers={"X-Admin-Password": PRODUCTION_ADMIN_PASSWORD},
            timeout=15,
        )

    try:
        resp = await run_in_threadpool(_fetch)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Leads server error")
        return resp.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Leads proxy failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not reach the leads server")


# ---------------- Google Sheets Sync ----------------
async def _sync_quote_to_sheet(quote: "Quote"):
    doc = await db.settings.find_one({"key": gs.TOKENS_KEY})
    if not doc:
        return
    try:
        creds = await asyncio.to_thread(gs.doc_to_creds, doc)
        if creds.token != doc["access_token"]:
            await db.settings.update_one({"key": gs.TOKENS_KEY}, {"$set": gs.creds_to_doc(creds)})
        await asyncio.to_thread(gs.append_rows, creds, doc["spreadsheet_id"], [gs.quote_to_row(quote.model_dump())])
        logger.info("Quote synced to Google Sheet")
    except Exception as e:
        logger.error("Google Sheets sync failed: %s", e)


def _callback_uri(request: Request) -> str:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    return f"https://{host}/api/oauth/sheets/callback"


@api_router.get("/sheets/connect-url")
async def sheets_connect_url(request: Request, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    if not os.environ.get("GOOGLE_CLIENT_ID") or not os.environ.get("GOOGLE_CLIENT_SECRET"):
        raise HTTPException(status_code=500, detail="Google credentials not configured")
    redirect_uri = _callback_uri(request)
    url, state = gs.build_auth_url(redirect_uri)
    await db.oauth_states.insert_one({
        "state": state, "redirect_uri": redirect_uri,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": url}


@api_router.get("/oauth/sheets/callback")
async def sheets_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error or not code or not state:
        return RedirectResponse("/admin?sheets=error")
    state_doc = await db.oauth_states.find_one_and_delete({"state": state})
    if not state_doc:
        return RedirectResponse("/admin?sheets=error")
    created = datetime.fromisoformat(state_doc["created_at"])
    if datetime.now(timezone.utc) - created > timedelta(minutes=10):
        return RedirectResponse("/admin?sheets=error")
    try:
        creds = await asyncio.to_thread(gs.exchange_code, code, state_doc["redirect_uri"])
        email = await asyncio.to_thread(gs.get_user_email, creds)
        sid = await asyncio.to_thread(gs.create_spreadsheet, creds)
        token_doc = gs.creds_to_doc(creds)
        token_doc.update({
            "key": gs.TOKENS_KEY, "spreadsheet_id": sid, "email": email,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.settings.update_one({"key": gs.TOKENS_KEY}, {"$set": token_doc}, upsert=True)
        quotes = await db.quotes.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
        if quotes:
            await asyncio.to_thread(gs.append_rows, creds, sid, [gs.quote_to_row(q) for q in quotes])
        logger.info("Google Sheets connected (%s), backfilled %d quotes", email, len(quotes))
        return RedirectResponse("/admin?sheets=connected")
    except Exception as e:
        logger.error("Google Sheets connect failed: %s", e)
        return RedirectResponse("/admin?sheets=error")


@api_router.get("/sheets/status")
async def sheets_status(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    doc = await db.settings.find_one({"key": gs.TOKENS_KEY})
    if not doc:
        return {"connected": False}
    return {
        "connected": True,
        "email": doc.get("email", ""),
        "sheet_url": f"https://docs.google.com/spreadsheets/d/{doc['spreadsheet_id']}",
    }


@api_router.post("/sheets/disconnect")
async def sheets_disconnect(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    await db.settings.delete_one({"key": gs.TOKENS_KEY})
    return {"ok": True}


# ---------------- Site Images ----------------
def _clean_image(doc):
    return {"id": doc["id"], "section": doc["section"], "label": doc.get("label", ""),
            "order": doc.get("order", 0), "url": doc["url"]}


@api_router.get("/site-images")
async def get_site_images():
    docs = await db.site_images.find({"is_deleted": False}).sort("order", 1).to_list(1000)
    hero = next((_clean_image(d) for d in docs if d["section"] == "hero"), None)
    why = next((_clean_image(d) for d in docs if d["section"] == "why"), None)
    gallery = [_clean_image(d) for d in docs if d["section"] == "gallery"]
    return {"hero": hero, "why": why, "gallery": gallery}


@api_router.post("/site-images/upload")
async def upload_site_image(
    file: UploadFile = File(...),
    section: str = Form(...),
    label: str = Form(""),
    x_admin_password: Optional[str] = Header(default=None),
):
    _check_admin(x_admin_password)
    if section not in ("hero", "gallery", "why"):
        raise HTTPException(status_code=400, detail="section must be 'hero', 'why' or 'gallery'")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png").lower()
    content_type = MIME_TYPES.get(ext, file.content_type or "image/png")
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")
    storage_path = f"{APP_NAME}/site/{uuid.uuid4()}.{ext}"
    try:
        result = put_object(storage_path, data, content_type)
    except Exception as e:
        logger.error("Storage upload failed: %s", e)
        raise HTTPException(status_code=502, detail="Image upload failed. Please try again.")

    stored_path = result.get("path", storage_path)
    url = f"/api/site-images/file/{stored_path}"

    if section in ("hero", "why"):
        await db.site_images.update_many({"section": section, "is_deleted": False}, {"$set": {"is_deleted": True}})
        order = 0
    else:
        last = await db.site_images.find({"section": "gallery", "is_deleted": False}).sort("order", -1).to_list(1)
        order = (last[0]["order"] + 1) if last else 0

    doc = {
        "id": str(uuid.uuid4()),
        "section": section,
        "label": label or "",
        "order": order,
        "url": url,
        "storage_path": stored_path,
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.site_images.insert_one(doc)
    return _clean_image(doc)


@api_router.delete("/site-images/{image_id}")
async def delete_site_image(image_id: str, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    res = await db.site_images.update_one({"id": image_id}, {"$set": {"is_deleted": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"ok": True}


class ReorderPayload(BaseModel):
    order: List[str]


@api_router.post("/site-images/reorder")
async def reorder_site_images(payload: ReorderPayload, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    operations = [
        UpdateOne(
            {"id": image_id, "section": "gallery", "is_deleted": False},
            {"$set": {"order": idx}},
        )
        for idx, image_id in enumerate(payload.order)
    ]
    if operations:
        await db.site_images.bulk_write(operations)
    return {"ok": True}


@api_router.get("/site-images/file/{path:path}")
async def serve_site_image(path: str):
    try:
        data, content_type = get_object(path)
        return Response(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=86400"})
    except Exception:
        raise HTTPException(status_code=404, detail="Image not found")


# ---------------- App (Mobile) Images ----------------
# Managed exclusively by the Tidyups mobile app admin ("Images" tab).
# Fully independent from the website's site_images collection.
SEED_APP_IMAGES = [
    {"label": "Move In / Move Out Cleaning", "order": 0,
     "url": "/api/app-images/file/tidyups-quote/app/0f13d95a-be19-453c-9409-62a66316df07.jpg",
     "storage_path": "tidyups-quote/app/0f13d95a-be19-453c-9409-62a66316df07.jpg"},
    {"label": "Deep Cleaning Specialists", "order": 1,
     "url": "/api/app-images/file/tidyups-quote/app/a3cb0f83-c544-4133-aa17-e14969e120b4.jpg",
     "storage_path": "tidyups-quote/app/a3cb0f83-c544-4133-aa17-e14969e120b4.jpg"},
    {"label": "We've Got You Covered!", "order": 2,
     "url": "https://customer-assets-jai6qajn.emergentagent.net/job_mobile-run-app-1/artifacts/podteo7q_IMG_0625.jpeg"},
    {"label": "Our Fleet", "order": 3,
     "url": "https://customer-assets-jai6qajn.emergentagent.net/job_mobile-run-app-1/artifacts/mg7te29i_Untitled%20-%20June%2021%2C%202026%20at%2002.07.37.jpeg"},
    {"label": "Tidyups Magic", "order": 4,
     "url": "https://customer-assets-jai6qajn.emergentagent.net/job_mobile-run-app-1/artifacts/fhxupxqx_69AA263F-7E8A-4D4D-8C9F-E625B5872270.jpeg"},
]


def _clean_app_image(doc):
    return {"id": doc["id"], "label": doc.get("label", ""), "order": doc.get("order", 0), "url": doc["url"],
            "fit": doc.get("fit", "cover")}


async def seed_app_images():
    count = await db.app_images.count_documents({})
    if count == 0:
        docs = []
        for s in SEED_APP_IMAGES:
            docs.append({
                "id": str(uuid.uuid4()),
                "label": s["label"],
                "order": s["order"],
                "url": s["url"],
                "storage_path": s.get("storage_path"),
                "is_deleted": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        await db.app_images.insert_many(docs)
        logger.info("Seeded %d app images", len(docs))


@api_router.get("/app-images")
async def list_app_images():
    docs = await db.app_images.find({"is_deleted": False}).sort("order", 1).to_list(1000)
    return [_clean_app_image(d) for d in docs]


@api_router.post("/app-images/upload")
async def upload_app_image(
    file: UploadFile = File(...),
    label: str = Form(""),
    x_admin_password: Optional[str] = Header(default=None),
):
    _check_admin(x_admin_password)
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png").lower()
    content_type = MIME_TYPES.get(ext, file.content_type or "image/png")
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")
    storage_path = f"{APP_NAME}/app/{uuid.uuid4()}.{ext}"
    try:
        result = put_object(storage_path, data, content_type)
    except Exception as e:
        logger.error("Storage upload failed: %s", e)
        raise HTTPException(status_code=502, detail="Image upload failed. Please try again.")

    stored_path = result.get("path", storage_path)
    url = f"/api/app-images/file/{stored_path}"
    last = await db.app_images.find({"is_deleted": False}).sort("order", -1).to_list(1)
    order = (last[0]["order"] + 1) if last else 0
    doc = {
        "id": str(uuid.uuid4()),
        "label": label or "",
        "order": order,
        "url": url,
        "storage_path": stored_path,
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.app_images.insert_one(doc)
    return _clean_app_image(doc)


@api_router.delete("/app-images/{image_id}")
async def delete_app_image(image_id: str, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    res = await db.app_images.update_one({"id": image_id}, {"$set": {"is_deleted": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"ok": True}


@api_router.post("/app-images/reorder")
async def reorder_app_images(payload: ReorderPayload, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    operations = [
        UpdateOne(
            {"id": image_id, "is_deleted": False},
            {"$set": {"order": idx}},
        )
        for idx, image_id in enumerate(payload.order)
    ]
    if operations:
        await db.app_images.bulk_write(operations)
    return {"ok": True}


@api_router.get("/app-images/file/{path:path}")
async def serve_app_image(
    path: str,
    sig: Optional[str] = None,
    exp: Optional[str] = None,
    x_admin_password: Optional[str] = Header(default=None),
    x_cleaner_id: Optional[str] = Header(default=None),
    x_cleaner_pin: Optional[str] = Header(default=None),
):
    # Job-proof photos (customer property) require a valid short-lived signature
    # (attached by _clean_assignment) OR admin/cleaner header auth.
    if "/proof/" in path:
        authorized = _proof_sig_ok(path, sig, exp)
        if not authorized and x_admin_password:
            try:
                _check_admin(x_admin_password)
                authorized = True
            except HTTPException:
                pass
        if not authorized and x_cleaner_id and x_cleaner_pin:
            try:
                _check_pin(x_cleaner_pin, await _get_cleaner_pin())
                parts = path.split("/proof/", 1)[1].split("/", 1)
                aid = parts[0] if parts else ""
                if aid and await db.assignments.find_one({"id": aid, "cleaner_id": x_cleaner_id}):
                    authorized = True
            except HTTPException:
                pass
        if not authorized:
            raise HTTPException(status_code=401, detail="Auth required for proof photos")
    try:
        data, content_type = get_object(path)
        return Response(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=86400"})
    except Exception:
        raise HTTPException(status_code=404, detail="Image not found")


class ImageFitPayload(BaseModel):
    fit: str


@api_router.patch("/app-images/{image_id}")
async def update_app_image(image_id: str, payload: ImageFitPayload, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    if payload.fit not in ("cover", "contain"):
        raise HTTPException(status_code=400, detail="fit must be 'cover' or 'contain'")
    res = await db.app_images.update_one({"id": image_id, "is_deleted": False}, {"$set": {"fit": payload.fit}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Image not found")
    doc = await db.app_images.find_one({"id": image_id}, {"_id": 0})
    return _clean_app_image(doc)


# ---------------- App (Mobile) Business Settings ----------------
DEFAULT_BUSINESS = {
    "phone_display": "(780) 718-5092",
    "tollfree_display": "(833) TIDY-UPS",
    "tollfree_sub": "+1 (833) 843-9877",
    "address": "6510 Gateway Boulevard Suite 1020",
    "city_line": "Edmonton, AB T6H 5Z5",
    "website": "tidyupscleaning.com",
    "hours": [
        {"day": "Monday – Friday", "time": "8:00 AM – 6:00 PM"},
        {"day": "Saturday", "time": "9:00 AM – 4:00 PM"},
        {"day": "Sunday", "time": "Closed"},
    ],
    "logo_url": None,
    "review_url": "",
    "require_photos_for_done": False,
}


def _tel_link(value):
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 10:
        digits = "1" + digits
    return f"tel:+{digits}" if digits else ""


class HoursRow(BaseModel):
    day: str
    time: str


class BusinessSettingsUpdate(BaseModel):
    phone_display: Optional[str] = None
    tollfree_display: Optional[str] = None
    tollfree_sub: Optional[str] = None
    address: Optional[str] = None
    city_line: Optional[str] = None
    website: Optional[str] = None
    hours: Optional[List[HoursRow]] = None
    review_url: Optional[str] = None
    require_photos_for_done: Optional[bool] = None


async def _get_business_merged():
    doc = await db.app_settings.find_one({"key": "business"}, {"_id": 0}) or {}
    return {**DEFAULT_BUSINESS, **{k: v for k, v in doc.items() if k != "key" and v is not None}}


def _business_response(merged):
    website = merged.get("website") or ""
    website_url = website if website.startswith("http") else (f"https://{website}" if website else "")
    return {
        **merged,
        "phone_tel": _tel_link(merged.get("phone_display")),
        "tollfree_tel": _tel_link(merged.get("tollfree_sub") or merged.get("tollfree_display")),
        "maps_url": "https://maps.google.com/?q=" + quote_plus(f"{merged.get('address', '')}, {merged.get('city_line', '')}"),
        "website_url": website_url,
    }


@api_router.get("/app-settings")
async def get_app_settings():
    return _business_response(await _get_business_merged())


@api_router.put("/app-settings")
async def update_app_settings(payload: BusinessSettingsUpdate, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    updates = payload.model_dump(exclude_unset=True)
    if updates:
        await db.app_settings.update_one({"key": "business"}, {"$set": updates}, upsert=True)
    return _business_response(await _get_business_merged())


@api_router.post("/app-settings/logo")
async def upload_app_logo(file: UploadFile = File(...), x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png").lower()
    content_type = MIME_TYPES.get(ext, file.content_type or "image/png")
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo too large (max 5MB)")
    storage_path = f"{APP_NAME}/app/logo-{uuid.uuid4()}.{ext}"
    try:
        result = put_object(storage_path, data, content_type)
    except Exception as e:
        logger.error("Logo upload failed: %s", e)
        raise HTTPException(status_code=502, detail="Logo upload failed. Please try again.")
    url = f"/api/app-images/file/{result.get('path', storage_path)}"
    await db.app_settings.update_one({"key": "business"}, {"$set": {"logo_url": url}}, upsert=True)
    return _business_response(await _get_business_merged())


@api_router.delete("/app-settings/logo")
async def reset_app_logo(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    await db.app_settings.update_one({"key": "business"}, {"$set": {"logo_url": None}}, upsert=True)
    return _business_response(await _get_business_merged())


# ---------------- Cleaner Location Tracking ----------------
DEFAULT_CLEANER_PIN = "1234"


async def _get_cleaner_pin():
    doc = await db.app_settings.find_one({"key": "staff"})
    return (doc or {}).get("cleaner_pin") or DEFAULT_CLEANER_PIN


def _check_pin(pin: Optional[str], expected: str):
    if not pin or not _secrets.compare_digest(str(pin), str(expected)):
        raise HTTPException(status_code=401, detail="Invalid cleaner PIN")


class PinUpdate(BaseModel):
    pin: str


@api_router.get("/staff/pin")
async def get_staff_pin(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    doc = await db.app_settings.find_one({"key": "staff"})
    pin = (doc or {}).get("cleaner_pin") or DEFAULT_CLEANER_PIN
    return {"pin": pin, "is_default": pin == DEFAULT_CLEANER_PIN}


@api_router.put("/staff/pin")
async def update_staff_pin(payload: PinUpdate, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    pin = payload.pin.strip()
    if not re.fullmatch(r"\d{4,8}", pin):
        raise HTTPException(status_code=400, detail="PIN must be 4-8 digits")
    await db.app_settings.update_one({"key": "staff"}, {"$set": {"cleaner_pin": pin}}, upsert=True)
    return {"pin": pin, "is_default": pin == DEFAULT_CLEANER_PIN}


class CleanerCheckin(BaseModel):
    name: str
    pin: str


class CleanerLocationPing(BaseModel):
    cleaner_id: str
    pin: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class CleanerStopPayload(BaseModel):
    cleaner_id: str
    pin: str


def _clean_cleaner(doc):
    return {"id": doc["id"], "name": doc["name"], "sharing": doc.get("sharing", False),
            "lat": doc.get("lat"), "lng": doc.get("lng"), "last_seen": doc.get("last_seen")}


@api_router.post("/cleaners/checkin")
async def cleaner_checkin(payload: CleanerCheckin):
    _check_pin(payload.pin, await _get_cleaner_pin())
    name = " ".join(payload.name.split()).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if len(name) > 80:
        raise HTTPException(status_code=400, detail="Name too long (max 80 characters)")
    name_key = name.lower()
    doc = await db.cleaners.find_one({"name_key": name_key})
    if not doc:
        doc = {
            "id": str(uuid.uuid4()), "name": name, "name_key": name_key,
            "sharing": False, "lat": None, "lng": None, "history": [],
            "last_seen": None, "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cleaners.insert_one(doc)
    return {"cleaner_id": doc["id"], "name": doc["name"]}


@api_router.post("/cleaners/location")
async def cleaner_location(payload: CleanerLocationPing):
    _check_pin(payload.pin, await _get_cleaner_pin())
    now = datetime.now(timezone.utc).isoformat()
    res = await db.cleaners.update_one(
        {"id": payload.cleaner_id},
        {"$set": {"lat": payload.lat, "lng": payload.lng, "sharing": True, "last_seen": now},
         "$push": {"history": {"$each": [{"lat": payload.lat, "lng": payload.lng, "at": now}], "$slice": -20}}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cleaner not found — please check in again")
    return {"ok": True, "at": now}


@api_router.post("/cleaners/stop")
async def cleaner_stop(payload: CleanerStopPayload):
    _check_pin(payload.pin, await _get_cleaner_pin())
    await db.cleaners.update_one({"id": payload.cleaner_id}, {"$set": {"sharing": False}})
    return {"ok": True}


@api_router.get("/cleaners")
async def list_cleaners(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    docs = await db.cleaners.find({}).sort("last_seen", -1).to_list(200)
    return [_clean_cleaner(d) for d in docs]


@api_router.delete("/cleaners/{cleaner_id}")
async def delete_cleaner(cleaner_id: str, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    res = await db.cleaners.delete_one({"id": cleaner_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cleaner not found")
    await db.assignments.delete_many({"cleaner_id": cleaner_id})
    return {"ok": True}


# ---------------- Job Assignments (Dispatch) ----------------
class AssignmentCreate(BaseModel):
    quote_id: str
    cleaner_id: str
    customer_name: str
    service_type: str
    address: Optional[str] = None
    phone: Optional[str] = None
    preferred_date: Optional[str] = None
    message: Optional[str] = None


ASSIGNMENT_FIELDS = ("id", "quote_id", "cleaner_id", "cleaner_name", "customer_name", "service_type",
                     "address", "phone", "preferred_date", "message", "status", "created_at",
                     "status_updated_at", "started_at", "completed_at", "photos", "review_sent_at")


def _job_duration_seconds(doc) -> Optional[int]:
    """Return the number of seconds the cleaner was actively working the job
    (started_at -> completed_at). None until both timestamps exist."""
    started, completed = doc.get("started_at"), doc.get("completed_at")
    if not started or not completed:
        return None
    try:
        s = datetime.fromisoformat(started.replace("Z", "+00:00"))
        c = datetime.fromisoformat(completed.replace("Z", "+00:00"))
        delta = (c - s).total_seconds()
        return int(delta) if delta >= 0 else None
    except (ValueError, AttributeError):
        return None


def _client_key(name: Optional[str], phone: Optional[str]) -> str:
    """Stable per-customer key: lowercased trimmed name + digits-only phone."""
    n = (name or "").strip().lower()
    p = re.sub(r"\D", "", phone or "")
    return f"{n}|{p}"


async def _load_client_notes_map(assignments: List[dict]) -> dict:
    """Fetch client notes for a batch of assignments in one query, keyed by _client_key."""
    keys = list({_client_key(a.get("customer_name"), a.get("phone")) for a in assignments})
    if not keys:
        return {}
    docs = await db.client_notes.find({"key": {"$in": keys}}, {"_id": 0}).to_list(len(keys))
    return {d["key"]: d.get("notes", "") for d in docs}


def _clean_assignment(doc, notes: str = ""):
    out = {k: doc.get(k) for k in ASSIGNMENT_FIELDS}
    photos = out.get("photos") or []
    # Attach a short-lived signature so admin/cleaner UIs can render proof photos over <img>.
    out["photos"] = [
        {**p, "url": _apply_proof_signature(p.get("url", ""))} for p in photos
    ]
    out["client_notes"] = notes
    out["duration_seconds"] = _job_duration_seconds(doc)
    return out


async def _clean_assignments_with_notes(docs: List[dict]) -> List[dict]:
    notes_map = await _load_client_notes_map(docs)
    return [_clean_assignment(d, notes_map.get(_client_key(d.get("customer_name"), d.get("phone")), "")) for d in docs]


@api_router.post("/assignments")
async def create_assignment(payload: AssignmentCreate, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    cleaner = await db.cleaners.find_one({"id": payload.cleaner_id})
    if not cleaner:
        raise HTTPException(status_code=404, detail="Cleaner not found")
    doc = {
        "id": str(uuid.uuid4()),
        **payload.model_dump(),
        "cleaner_name": cleaner["name"],
        "status": "assigned",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.assignments.delete_many({"quote_id": payload.quote_id, "status": {"$ne": "done"}})
    await db.assignments.insert_one(doc)
    notes_map = await _load_client_notes_map([doc])
    return _clean_assignment(doc, notes_map.get(_client_key(doc.get("customer_name"), doc.get("phone")), ""))


@api_router.get("/assignments")
async def list_assignments(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    docs = await db.assignments.find({}).sort("created_at", -1).to_list(500)
    return await _clean_assignments_with_notes(docs)


@api_router.delete("/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    res = await db.assignments.delete_one({"id": assignment_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"ok": True}


@api_router.get("/cleaners/{cleaner_id}/jobs")
async def cleaner_jobs(cleaner_id: str, x_cleaner_pin: Optional[str] = Header(default=None)):
    _check_pin(x_cleaner_pin, await _get_cleaner_pin())
    docs = await db.assignments.find(
        {"cleaner_id": cleaner_id, "status": {"$in": ["assigned", "on_the_way", "cleaning"]}}
    ).sort("created_at", -1).to_list(100)
    return await _clean_assignments_with_notes(docs)


class AssignmentStatusUpdate(BaseModel):
    cleaner_id: str
    pin: str
    status: str


@api_router.post("/assignments/{assignment_id}/status")
async def update_assignment_status(assignment_id: str, payload: AssignmentStatusUpdate):
    _check_pin(payload.pin, await _get_cleaner_pin())
    if payload.status not in ("on_the_way", "cleaning", "done"):
        raise HTTPException(status_code=400, detail="Invalid status")
    now_iso = datetime.now(timezone.utc).isoformat()
    updates = {"status": payload.status, "status_updated_at": now_iso}
    if payload.status == "cleaning":
        # Stamp started_at the FIRST time the cleaner marks the job "cleaning" — the
        # start of the timer. Uses $setOnInsert-style semantics via a separate query
        # below so re-tapping "cleaning" doesn't reset the timer.
        existing = await db.assignments.find_one(
            {"id": assignment_id, "cleaner_id": payload.cleaner_id},
            {"_id": 0, "started_at": 1},
        )
        if existing is not None and not existing.get("started_at"):
            updates["started_at"] = now_iso
    if payload.status == "done":
        # Insurance-protection guard: if admin has toggled "require photos for done",
        # block the transition when this assignment lacks at least 1 before + 1 after photo.
        biz = await _get_business_merged()
        if biz.get("require_photos_for_done"):
            existing = await db.assignments.find_one(
                {"id": assignment_id, "cleaner_id": payload.cleaner_id},
                {"_id": 0, "photos": 1},
            )
            if existing is None:
                raise HTTPException(status_code=404, detail="Assignment not found")
            photos = existing.get("photos") or []
            has_before = any(p.get("kind") == "before" for p in photos)
            has_after = any(p.get("kind") == "after" for p in photos)
            if not (has_before and has_after):
                missing = []
                if not has_before:
                    missing.append("before")
                if not has_after:
                    missing.append("after")
                raise HTTPException(
                    status_code=400,
                    detail=f"At least one {' and one '.join(missing)} photo is required before marking this job Done.",
                )
        # Atomic transition-to-done: only the FIRST request that flips this doc's status
        # to 'done' will match; a rapid double-tap by the cleaner will hit the second
        # branch and NOT re-schedule the review SMS.
        updates["completed_at"] = now_iso
        doc = await db.assignments.find_one_and_update(
            {"id": assignment_id, "cleaner_id": payload.cleaner_id, "status": {"$ne": "done"}},
            {"$set": updates},
            projection={"_id": 0},
            return_document=ReturnDocument.AFTER,
        )
        if doc is None:
            # already done — nothing to do (no duplicate SMS)
            still = await db.assignments.find_one({"id": assignment_id, "cleaner_id": payload.cleaner_id})
            if not still:
                raise HTTPException(status_code=404, detail="Assignment not found")
            return {"ok": True, "status": "done", "already": True}
        if not doc.get("review_sent_at"):
            _schedule_bg(_auto_send_review(doc), name=f"review-{assignment_id}")
        return {"ok": True, "status": "done"}

    res = await db.assignments.update_one(
        {"id": assignment_id, "cleaner_id": payload.cleaner_id}, {"$set": updates}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"ok": True, "status": payload.status}


# ---------------- Job History ----------------
@api_router.get("/assignments/history")
async def assignments_history(
    cleaner_id: Optional[str] = None,
    limit: int = 100,
    x_admin_password: Optional[str] = Header(default=None),
):
    _check_admin(x_admin_password)
    limit = max(1, min(limit, 500))
    query = {"status": "done"}
    if cleaner_id:
        query["cleaner_id"] = cleaner_id
    docs = await db.assignments.find(query).sort("completed_at", -1).to_list(limit)
    return await _clean_assignments_with_notes(docs)


# ---------------- Client Notes ----------------
class ClientNotesUpdate(BaseModel):
    customer_name: str
    phone: Optional[str] = ""
    notes: str


@api_router.get("/clients/notes")
async def get_client_notes(
    customer_name: str,
    phone: Optional[str] = "",
    x_admin_password: Optional[str] = Header(default=None),
):
    _check_admin(x_admin_password)
    key = _client_key(customer_name, phone)
    doc = await db.client_notes.find_one({"key": key}, {"_id": 0})
    return {
        "customer_name": customer_name,
        "phone": phone or "",
        "notes": (doc or {}).get("notes", ""),
        "updated_at": (doc or {}).get("updated_at"),
    }


@api_router.put("/clients/notes")
async def put_client_notes(payload: ClientNotesUpdate, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    key = _client_key(payload.customer_name, payload.phone)
    now_iso = datetime.now(timezone.utc).isoformat()
    notes = (payload.notes or "").strip()
    if len(notes) > 2000:
        raise HTTPException(status_code=400, detail="Notes too long (max 2000 characters)")
    await db.client_notes.update_one(
        {"key": key},
        {"$set": {
            "key": key,
            "customer_name": payload.customer_name,
            "phone": payload.phone or "",
            "notes": notes,
            "updated_at": now_iso,
        }},
        upsert=True,
    )
    return {"customer_name": payload.customer_name, "phone": payload.phone or "", "notes": notes, "updated_at": now_iso}


class ClientMergeRequest(BaseModel):
    from_name: str
    from_phone: Optional[str] = ""
    into_name: str
    into_phone: Optional[str] = ""


@api_router.post("/clients/merge")
async def merge_client(payload: ClientMergeRequest, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    from_key = _client_key(payload.from_name, payload.from_phone)
    into_key = _client_key(payload.into_name, payload.into_phone)
    if from_key == into_key:
        raise HTTPException(status_code=400, detail="Source and target are already the same client")

    # Two-phase merge: (1) find candidate assignment IDs by name (case-insensitive), then
    # filter to those whose digits-only phone matches the source; (2) do ONE atomic
    # update_many by IDs. This gives all-or-nothing semantics for the write itself and
    # avoids the per-doc loop that could partial-fail.
    from_phone_digits = re.sub(r"\D", "", payload.from_phone or "")
    name_regex = {"$regex": f"^{re.escape(payload.from_name.strip())}$", "$options": "i"}
    candidates = await db.assignments.find(
        {"customer_name": name_regex}, {"_id": 0, "id": 1, "phone": 1}
    ).to_list(None)
    ids_to_move = [
        c["id"] for c in candidates
        if re.sub(r"\D", "", c.get("phone") or "") == from_phone_digits
    ]
    moved = 0
    if ids_to_move:
        result = await db.assignments.update_many(
            {"id": {"$in": ids_to_move}},
            {"$set": {"customer_name": payload.into_name, "phone": payload.into_phone or ""}},
        )
        moved = result.modified_count

    # Merge notes: concatenate source notes into target if both present.
    src_notes_doc = await db.client_notes.find_one({"key": from_key})
    tgt_notes_doc = await db.client_notes.find_one({"key": into_key})
    src_notes = (src_notes_doc or {}).get("notes", "").strip()
    tgt_notes = (tgt_notes_doc or {}).get("notes", "").strip()
    combined = tgt_notes
    if src_notes and src_notes not in tgt_notes:
        combined = f"{tgt_notes}\n\n[merged from {payload.from_name}] {src_notes}".strip() if tgt_notes else src_notes
    if combined:
        await db.client_notes.update_one(
            {"key": into_key},
            {"$set": {
                "key": into_key,
                "customer_name": payload.into_name,
                "phone": payload.into_phone or "",
                "notes": combined,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
    await db.client_notes.delete_one({"key": from_key})
    return {"moved_assignments": moved, "into_key": into_key, "merged_notes": bool(src_notes and combined != tgt_notes)}


# ---------------- Photo Proof ----------------
@api_router.post("/assignments/{assignment_id}/photos")
async def upload_assignment_photo(
    assignment_id: str,
    file: UploadFile = File(...),
    kind: str = Form(...),
    cleaner_id: str = Form(...),
    pin: str = Form(...),
):
    _check_pin(pin, await _get_cleaner_pin())
    if kind not in ("before", "after"):
        raise HTTPException(status_code=400, detail="kind must be 'before' or 'after'")
    assignment = await db.assignments.find_one({"id": assignment_id, "cleaner_id": cleaner_id})
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg").lower()
    content_type = MIME_TYPES.get(ext, file.content_type or "image/jpeg")
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo too large (max 10MB)")
    storage_path = f"{APP_NAME}/proof/{assignment_id}/{uuid.uuid4()}.{ext}"
    try:
        result = await run_in_threadpool(put_object, storage_path, data, content_type)
    except Exception as e:
        logger.error("Photo upload failed: %s", e)
        raise HTTPException(status_code=502, detail="Photo upload failed. Please try again.")
    stored_path = result.get("path", storage_path)
    photo = {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "url": f"/api/app-images/file/{stored_path}",
        "storage_path": stored_path,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.assignments.update_one({"id": assignment_id}, {"$push": {"photos": photo}})
    return photo


@api_router.delete("/assignments/{assignment_id}/photos/{photo_id}")
async def delete_assignment_photo(
    assignment_id: str,
    photo_id: str,
    cleaner_id: str,
    pin: str,
):
    _check_pin(pin, await _get_cleaner_pin())
    res = await db.assignments.update_one(
        {"id": assignment_id, "cleaner_id": cleaner_id},
        {"$pull": {"photos": {"id": photo_id}}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"ok": True}


# ---------------- Review Requests ----------------
async def _get_review_url():
    merged = await _get_business_merged()
    return (merged.get("review_url") or "").strip()


def _send_review_sms(phone: str, customer_name: str, review_url: str) -> bool:
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_number = os.environ.get("TWILIO_FROM_NUMBER")
    if not all([sid, token, from_number]):
        logger.warning("Twilio not fully configured; skipping review SMS")
        return False
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 10:
        digits = "1" + digits
    if len(digits) < 11:
        logger.warning("Invalid phone for review SMS: %s", phone)
        return False
    to = f"+{digits}"
    first = (customer_name or "there").split()[0]
    body = (
        f"Hi {first}, thanks for choosing Tidyups Cleaning! "
        f"We'd love to hear how we did — a quick Google review helps our small team a lot: {review_url}"
    )
    try:
        TwilioClient(sid, token).messages.create(body=body, from_=from_number, to=to)
        logger.info("Review SMS sent to %s", to)
        return True
    except Exception as e:
        logger.error("Review SMS failed: %s", e)
        return False


async def _auto_send_review(assignment: dict):
    if not assignment.get("phone"):
        return
    review_url = await _get_review_url()
    if not review_url:
        return
    sent = await run_in_threadpool(
        _send_review_sms, assignment["phone"], assignment.get("customer_name", ""), review_url
    )
    if sent:
        await db.assignments.update_one(
            {"id": assignment["id"]},
            {"$set": {"review_sent_at": datetime.now(timezone.utc).isoformat()}},
        )


@api_router.post("/assignments/{assignment_id}/send-review")
async def send_review_request(assignment_id: str, x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    assignment = await db.assignments.find_one({"id": assignment_id}, {"_id": 0})
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if not assignment.get("phone"):
        raise HTTPException(status_code=400, detail="No customer phone on record")
    review_url = await _get_review_url()
    if not review_url:
        raise HTTPException(status_code=400, detail="Set a Google review link in Business settings first")
    sent = await run_in_threadpool(
        _send_review_sms, assignment["phone"], assignment.get("customer_name", ""), review_url
    )
    if not sent:
        raise HTTPException(
            status_code=502,
            detail="Could not send the SMS (Twilio not configured or send failed). Copy the review link and share it manually.",
        )
    now = datetime.now(timezone.utc).isoformat()
    await db.assignments.update_one({"id": assignment_id}, {"$set": {"review_sent_at": now}})
    return {"ok": True, "sent_via_sms": True, "review_sent_at": now, "review_url": review_url}


# ---------------- Owner Nightly Digest ----------------
def _digest_local_today_bounds():
    """Return today's ISO-string bounds in UTC (start-of-day, next-day) for the owner's TZ.
    Uses DIGEST_TZ_OFFSET_HOURS (default -7 = Edmonton/Mountain) to define "today"."""
    try:
        tz_off = int(os.environ.get("DIGEST_TZ_OFFSET_HOURS", "-7"))
    except ValueError:
        tz_off = -7
    now_utc = datetime.now(timezone.utc)
    local_now = now_utc + timedelta(hours=tz_off)
    local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    utc_start = (local_start - timedelta(hours=tz_off))
    utc_end = utc_start + timedelta(days=1)
    return utc_start.isoformat(), utc_end.isoformat(), local_now.date().isoformat()


async def _build_digest_body() -> str:
    utc_start, utc_end, local_date = _digest_local_today_bounds()

    leads_today = await db.quotes.count_documents({"created_at": {"$gte": utc_start, "$lt": utc_end}})
    top_lead = await db.quotes.find_one(
        {"created_at": {"$gte": utc_start, "$lt": utc_end}},
        sort=[("created_at", -1)],
    )

    done_today = await db.assignments.count_documents({
        "status": "done",
        "completed_at": {"$gte": utc_start, "$lt": utc_end},
    })
    missed_reviews = await db.assignments.count_documents({
        "status": "done",
        "completed_at": {"$gte": utc_start, "$lt": utc_end},
        "$or": [{"review_sent_at": None}, {"review_sent_at": {"$exists": False}}],
    })

    lines = [f"Scrubby daily digest · {local_date}"]
    lines.append(f"• Leads today: {leads_today}")
    if top_lead:
        lines.append(f"  ↳ latest: {top_lead.get('name','?')} — {top_lead.get('service_type','?')}")
    lines.append(f"• Jobs done: {done_today}")
    lines.append(f"• Missed reviews: {missed_reviews}")
    return "\n".join(lines)


def _send_digest_sms(body: str) -> bool:
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_number = os.environ.get("TWILIO_FROM_NUMBER")
    to = os.environ.get("DIGEST_TO_NUMBER") or os.environ.get("LEAD_ALERT_TO")
    if not all([sid, token, from_number, to]):
        logger.warning("Digest not sent — Twilio or DIGEST_TO_NUMBER missing")
        return False
    try:
        TwilioClient(sid, token).messages.create(body=body, from_=from_number, to=to)
        logger.info("Owner digest SMS sent to %s", to)
        return True
    except Exception as e:
        logger.error("Digest SMS failed: %s", e)
        return False


async def _send_digest_now() -> dict:
    body = await _build_digest_body()
    sent = await run_in_threadpool(_send_digest_sms, body)
    if sent:
        await db.app_settings.update_one(
            {"key": "digest_meta"},
            {"$set": {"key": "digest_meta", "last_sent_local_date": _digest_local_today_bounds()[2],
                      "last_sent_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    return {"sent": sent, "body": body}


@api_router.post("/admin/digest/send-now")
async def admin_digest_send_now(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    result = await _send_digest_now()
    if not result["sent"]:
        raise HTTPException(status_code=502, detail="Digest not sent — check DIGEST_TO_NUMBER and Twilio env vars.")
    return result


@api_router.get("/admin/digest/preview")
async def admin_digest_preview(x_admin_password: Optional[str] = Header(default=None)):
    _check_admin(x_admin_password)
    body = await _build_digest_body()
    return {"body": body, "to": os.environ.get("DIGEST_TO_NUMBER") or os.environ.get("LEAD_ALERT_TO") or ""}


async def _digest_scheduler_loop():
    """Fires once per day at DIGEST_HOUR (local, per DIGEST_TZ_OFFSET_HOURS). Idempotent via
    an atomic day-claim on `digest_meta` so multiple workers can safely coexist."""
    try:
        target_hour = int(os.environ.get("DIGEST_HOUR", "21"))  # 9pm default
    except ValueError:
        target_hour = 21
    logger.info("Digest scheduler started (target hour=%s)", target_hour)
    while True:
        try:
            try:
                tz_off = int(os.environ.get("DIGEST_TZ_OFFSET_HOURS", "-7"))
            except ValueError:
                tz_off = -7
            local_now = datetime.now(timezone.utc) + timedelta(hours=tz_off)
            local_today = local_now.date().isoformat()
            if local_now.hour >= target_hour:
                # Ensure the singleton `digest_meta` doc exists exactly once. `$setOnInsert`
                # + upsert is a true no-op if the doc already exists — no duplicates. This is
                # required because MongoDB's upsert on a `$ne` filter with an already-matching
                # value silently inserts a NEW doc (that was the bug in the original claim).
                await db.app_settings.update_one(
                    {"key": "digest_meta"},
                    {"$setOnInsert": {"key": "digest_meta", "last_sent_local_date": ""}},
                    upsert=True,
                )
                # Now claim today WITHOUT upsert. Only the FIRST worker to flip
                # `last_sent_local_date` -> today succeeds (modified_count == 1). Every
                # subsequent tick in the same day returns modified_count == 0 and skips.
                claim = await db.app_settings.update_one(
                    {"key": "digest_meta", "last_sent_local_date": {"$ne": local_today}},
                    {"$set": {"last_sent_local_date": local_today,
                              "claimed_at": datetime.now(timezone.utc).isoformat()}},
                )
                if claim.modified_count == 1:
                    # We won today's claim — send. On failure, roll the claim back so the
                    # next tick (or the next day) can retry.
                    result = await _send_digest_now()
                    if not result.get("sent"):
                        await db.app_settings.update_one(
                            {"key": "digest_meta", "last_sent_local_date": local_today},
                            {"$set": {"last_sent_local_date": ""}},
                        )
            # sleep until the top of the next hour (max 1h)
            next_wake = local_now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
            sleep_s = max(60, min(3600, int((next_wake - local_now).total_seconds())))
            await asyncio.sleep(sleep_s)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("Digest scheduler error: %s", e)
            await asyncio.sleep(300)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error("Storage init failed: %s", e)
    await seed_site_images()
    await seed_app_images()
    await _load_admin_password()
    # Clean up any duplicate digest_meta docs that may have accumulated from the old
    # buggy upsert claim (pre-fix). Keep the one with the latest last_sent_local_date.
    try:
        dupes = await db.app_settings.find({"key": "digest_meta"}).to_list(50)
        if len(dupes) > 1:
            dupes.sort(key=lambda d: d.get("last_sent_local_date", ""), reverse=True)
            keep_id = dupes[0]["_id"]
            await db.app_settings.delete_many({"key": "digest_meta", "_id": {"$ne": keep_id}})
            logger.info("Cleaned up %d duplicate digest_meta docs", len(dupes) - 1)
    except Exception as e:
        logger.warning("digest_meta dedupe failed: %s", e)
    # Start the nightly owner digest scheduler in the background.
    _schedule_bg(_digest_scheduler_loop(), name="digest-scheduler")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
