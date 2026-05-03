from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

CONFIG_PATH = Path(__file__).resolve().parents[1] / "shared" / "app_config.json"


@lru_cache(maxsize=1)
def get_app_config() -> dict[str, Any]:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


APP_CONFIG = get_app_config()
CV_MIN_CHARS = int(APP_CONFIG["cvMinChars"])
INTERVIEW_TIMER_SECONDS_DEFAULT = int(APP_CONFIG["interviewTimerSecondsDefault"])
INTERVIEW_TIMER_SECONDS_OPTIONS = [int(v) for v in APP_CONFIG["interviewTimerSecondsOptions"]]
DEFAULT_LANGUAGE = str(APP_CONFIG["defaultLanguage"])
LANGUAGE_MODE = str(APP_CONFIG["languageMode"])