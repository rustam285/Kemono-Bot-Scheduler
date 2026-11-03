import os
import subprocess
import sys
import threading

import static_ffmpeg
import uvicorn


def upgrade_extractors():
    print(">>> Upgrading yt-dlp and gallery-dl to latest versions...")
    try:
        subprocess.run(
            ["uv", "pip", "install", "--upgrade", "--quiet", "yt-dlp", "gallery-dl"],
            check=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        print(">>> uv failed, falling back to pip...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "--quiet", "yt-dlp", "gallery-dl"],
            check=True,
        )
    print(">>> Extractors upgraded.")


def setup_ffmpeg():
    print(">>> Setting up static-ffmpeg paths...")
    static_ffmpeg.add_paths()


if __name__ == "__main__":
    setup_ffmpeg()
    threading.Thread(target=upgrade_extractors, daemon=True).start()
    # По умолчанию слушаем только localhost: API без аутентификации,
    # 0.0.0.0 открывает его всей локальной сети (задайте HOST=0.0.0.0 осознанно)
    host = os.getenv("HOST", "127.0.0.1")
    print(f">>> Starting FastAPI server on http://{host}:8000 ...")
    uvicorn.run("main:app", host=host, port=8000, reload=False)
