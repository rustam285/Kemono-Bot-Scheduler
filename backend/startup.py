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
    print(">>> Starting FastAPI server on http://0.0.0.0:8000 ...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
