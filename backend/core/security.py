"""Password hashing utilities using bcrypt.

All hashing operations are CPU-intensive and run in thread pools
to avoid blocking the async event loop.
"""

import asyncio

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def get_password_hash(password: str) -> str:
    """Hash a plain-text password using bcrypt.

    Runs the CPU-intensive bcrypt operation in a thread pool
to avoid blocking the event loop.
    """
    return await asyncio.to_thread(pwd_context.hash, password)


async def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain-text password against a bcrypt hash.

    Runs the CPU-intensive bcrypt verification in a thread pool
to avoid blocking the event loop.
    """
    return await asyncio.to_thread(pwd_context.verify, plain, hashed)
