import hashlib

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def format_name(name: str) -> str:
    """Format name with Turkish locale - capitalize each word"""
    return ' '.join(word.capitalize() for word in name.strip().split())
