from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app_config
from interview_models import normalize_timer_seconds


ROOT = Path(__file__).resolve().parents[2]
SHARED_CONFIG = json.loads((ROOT / "shared" / "app_config.json").read_text(encoding="utf-8"))


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_shared_limits_are_single_source_for_backend_and_frontend():
    assert app_config.CV_MIN_CHARS == SHARED_CONFIG["cvMinChars"]
    assert app_config.INTERVIEW_TIMER_SECONDS_DEFAULT == SHARED_CONFIG["interviewTimerSecondsDefault"]
    assert app_config.INTERVIEW_TIMER_SECONDS_OPTIONS == SHARED_CONFIG["interviewTimerSecondsOptions"]

    app_js = read("frontend/src/App.js")
    interview_js = read("frontend/src/pages/InterviewPage.js")
    assert 'from "@app-config"' in app_js
    assert 'from "@app-config"' in interview_js
    assert "> 120" not in app_js
    assert "< 120" not in app_js


def test_language_is_explicitly_finnish_only_without_hidden_storage_flag():
    i18n = read("frontend/src/i18n.js")
    app_js = read("frontend/src/App.js")
    interview_js = read("frontend/src/pages/InterviewPage.js")

    assert app_config.LANGUAGE_MODE == "finnish-only"
    assert 'const DEFAULT_LANG = "fi"' in i18n
    assert "localStorage.setItem" not in i18n
    assert 'data-testid="language-notice"' in app_js
    assert 'data-testid="interview-language-notice"' in interview_js


def test_timer_config_accepts_known_values_and_falls_back_on_edges():
    assert normalize_timer_seconds(60) == 60
    assert normalize_timer_seconds("120") == 120
    assert normalize_timer_seconds(999) == app_config.INTERVIEW_TIMER_SECONDS_DEFAULT
    assert normalize_timer_seconds(None) == app_config.INTERVIEW_TIMER_SECONDS_DEFAULT


def test_error_ui_has_recovery_actions():
    assert 'data-testid="error-recovery-action"' in read("frontend/src/App.js")
    assert 'data-testid="interview-error-recovery-action"' in read("frontend/src/pages/InterviewPage.js")
    assert '"form.error.action"' in read("frontend/src/i18n.js")


def test_interview_timer_is_explained_and_off_by_default():
    chat_js = read("frontend/src/components/interview/InterviewChat.js")
    interview_js = read("frontend/src/pages/InterviewPage.js")
    i18n = read("frontend/src/i18n.js")

    assert "useState(false)" in chat_js
    assert 'data-testid="interview-timer-help-text"' in interview_js
    assert 'data-testid="interview-timer-optional-note"' in chat_js
    assert '"interview.timer.help"' in i18n


def test_focus_chips_have_accessible_labels_and_touch_targets():
    interview_js = read("frontend/src/pages/InterviewPage.js")
    assert "aria-label={`${t(\"interview.setup.removeFocus\")}: ${f}`}" in interview_js
    assert "min-h-11" in interview_js
    assert "min-w-11" in interview_js