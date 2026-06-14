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

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

LOGS_DIR = Path(__file__).parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)

SETTINGS_PATH = DATA_DIR / "settings.json"
COOKIES_PATH = DATA_DIR / "cookies.txt"
