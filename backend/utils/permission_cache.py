# In-memory permission invalidation cache
# When superadmin updates an admin's permissions, their ID is added here.
# The middleware checks this on every request and signals the frontend via header.

_invalidated_admins: set = set()


def invalidate_admin(admin_id: str):
    _invalidated_admins.add(admin_id)


def check_and_clear(admin_id: str) -> bool:
    if admin_id in _invalidated_admins:
        _invalidated_admins.discard(admin_id)
        return True
    return False
