"""
Rate Limiter - slowapi (endpoint bazlı) + global middleware desteği
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# slowapi - sadece @limiter.limit() ile dekore edilen endpoint'ler için
limiter = Limiter(key_func=get_remote_address)
