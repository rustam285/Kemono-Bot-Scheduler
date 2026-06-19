import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
VK_API_VERSION: str = os.getenv("VK_API_VERSION", "5.199")
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
MAX_TEMP_SIZE_GB: int = int(os.getenv("MAX_TEMP_SIZE_GB", "3"))
MAX_CONCURRENT_TASKS: int = int(os.getenv("MAX_CONCURRENT_TASKS", "3"))
ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY", "")

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

LOGS_DIR = Path(__file__).parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)

SETTINGS_PATH = DATA_DIR / "settings.json"
COOKIES_PATH = DATA_DIR / "cookies.txt"
TG_SESSION_PATH = DATA_DIR / "telegram.session"

VK_MAX_SLOT_ATTEMPTS: int = 5
VK_SLOT_DELAY_SECONDS: int = 1800
VK_API_MAX_RETRIES: int = 3
VK_API_RETRY_DELAYS: list[int] = [1, 4, 16]

TG_API_ID: int = int(os.getenv("TG_API_ID", "0"))
TG_API_HASH: str = os.getenv("TG_API_HASH", "")
TG_PROXY: str = os.getenv("TG_PROXY", "")

MEDIA_DEGRADED_THRESHOLD: int = 3
MEDIA_DEGRADED_WINDOW: int = 300
MEDIA_YTDLP_TIMEOUT: int = 30

TASK_CLEANUP_INTERVAL: int = 900
TASK_MAX_AGE_SECONDS: int = 3600
