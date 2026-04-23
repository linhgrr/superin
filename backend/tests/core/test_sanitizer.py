from core.utils import sanitizer


def test_normalize_unicode_skips_confusable_work_for_ascii(monkeypatch) -> None:
    ascii_text = "CalendarCalendarRead(id='abc123', color='oklch(0.70 0.18 250)')"

    def fail_normalize(*_args, **_kwargs):
        raise AssertionError("confusables.normalize should not run for ASCII text")

    monkeypatch.setattr(sanitizer.confusables, "normalize", fail_normalize)

    assert sanitizer._normalize_unicode(ascii_text) == ascii_text
