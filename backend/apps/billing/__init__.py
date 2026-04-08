"""Billing models and routes — platform-level, not a plugin.

Subscription state lives here. The GET /subscription endpoint is mounted in core/main.py
directly; this module is NOT registered as a plugin (no manifest, no widgets).
"""
