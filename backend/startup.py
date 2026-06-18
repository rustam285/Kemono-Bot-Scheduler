import subprocess
import sys

import static_ffmpeg
import uvicorn


def upgrade_extractors():
    print(">>> Upgrading yt-dlp and gallery-dl to latest versions...")
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "--upgrade", "--quiet", "yt-dlp", "gallery-dl"],
        check=True,
    )


def setup_ffmpeg():
    print(">>> Setting up static-ffmpeg paths...")
    static_ffmpeg.add_paths()


if __name__ == "__main__":
    upgrade_extractors()
    setup_ffmpeg()
    print(">>> Starting FastAPI server on http://0.0.0.0:8000 ...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
