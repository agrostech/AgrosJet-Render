"""
Storage path helpers.

Bu modül, Emergent / Railway gibi yazılabilir filesystem'i olan ortamlarda
varsayılan path'leri (örn. /app/uploads/...) kullanır; Render gibi read-only
filesystem'lerde otomatik olarak /tmp altına fallback yapar.

Gerçek dosya saklaması Cloudflare R2'de yapılıyor; bu local dizinler yalnızca
legacy serving ve geçici işlem (video yazma vb.) için kullanılıyor.
"""
import os
import tempfile


def get_writable_dir(default_path: str) -> str:
    """
    Return `default_path` if writable; otherwise return a `/tmp/<basename>` fallback.

    UPLOAD_BASE_DIR env var ile baz dizin tamamen override edilebilir.
    """
    override = os.environ.get("UPLOAD_BASE_DIR")
    if override:
        # Take the trailing component of default_path and append under override
        tail = default_path.rstrip("/").split("/uploads/", 1)
        sub = tail[1] if len(tail) > 1 else os.path.basename(default_path.rstrip("/"))
        candidate = os.path.join(override, sub)
        try:
            os.makedirs(candidate, exist_ok=True)
            return candidate
        except (PermissionError, OSError):
            pass  # fall through to default attempt

    try:
        os.makedirs(default_path, exist_ok=True)
        return default_path
    except (PermissionError, OSError):
        fallback = os.path.join(tempfile.gettempdir(), os.path.basename(default_path.rstrip("/")))
        os.makedirs(fallback, exist_ok=True)
        return fallback
