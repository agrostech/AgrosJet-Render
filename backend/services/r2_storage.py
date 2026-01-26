"""
Cloudflare R2 Storage Service
Handles file upload, download, and presigned URL generation for invoices and documents.
Settings are loaded from database first, then falls back to environment variables.
"""
import os
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Cache for R2 settings
_r2_settings_cache = None
_r2_settings_cache_time = None

# Fallback to environment variables
ENV_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
ENV_ACCESS_KEY_ID = os.getenv("CLOUDFLARE_ACCESS_KEY_ID")
ENV_SECRET_ACCESS_KEY = os.getenv("CLOUDFLARE_SECRET_ACCESS_KEY")
ENV_BUCKET_NAME = os.getenv("CLOUDFLARE_BUCKET_NAME", "shiftjet")


async def get_r2_settings():
    """
    Get R2 settings from database, with fallback to environment variables.
    Settings are cached for 60 seconds to avoid repeated DB calls.
    """
    global _r2_settings_cache, _r2_settings_cache_time
    import time
    from utils.database import db
    
    current_time = time.time()
    
    # Check cache (valid for 60 seconds)
    if _r2_settings_cache and _r2_settings_cache_time and (current_time - _r2_settings_cache_time) < 60:
        return _r2_settings_cache
    
    # Try to get from database
    settings = await db.system_settings.find_one(
        {"type": "cloudflare_r2"},
        {"_id": 0}
    )
    
    if settings and settings.get("account_id") and settings.get("access_key_id"):
        _r2_settings_cache = {
            "account_id": settings["account_id"],
            "access_key_id": settings["access_key_id"],
            "secret_access_key": settings["secret_access_key"],
            "bucket_name": settings.get("bucket_name", "shiftjet")
        }
    else:
        # Fallback to environment variables
        _r2_settings_cache = {
            "account_id": ENV_ACCOUNT_ID,
            "access_key_id": ENV_ACCESS_KEY_ID,
            "secret_access_key": ENV_SECRET_ACCESS_KEY,
            "bucket_name": ENV_BUCKET_NAME
        }
    
    _r2_settings_cache_time = current_time
    return _r2_settings_cache


def get_r2_settings_sync():
    """
    Synchronous version - uses cached settings or env variables.
    For use in non-async contexts.
    """
    if _r2_settings_cache:
        return _r2_settings_cache
    
    return {
        "account_id": ENV_ACCOUNT_ID,
        "access_key_id": ENV_ACCESS_KEY_ID,
        "secret_access_key": ENV_SECRET_ACCESS_KEY,
        "bucket_name": ENV_BUCKET_NAME
    }


def get_r2_client():
    """
    Create and return a configured boto3 S3 client for Cloudflare R2.
    Uses signature_version='s3v4' for proper presigned URL generation.
    """
    settings = get_r2_settings_sync()
    
    if not settings.get("account_id") or not settings.get("access_key_id"):
        logger.warning("R2 settings not configured")
        return None
    
    endpoint = f"https://{settings['account_id']}.r2.cloudflarestorage.com"
    
    return boto3.client(
        's3',
        endpoint_url=endpoint,
        aws_access_key_id=settings['access_key_id'],
        aws_secret_access_key=settings['secret_access_key'],
        region_name='auto',
        config=Config(signature_version='s3v4')
    )


# Legacy exports for backward compatibility
ACCOUNT_ID = ENV_ACCOUNT_ID
ACCESS_KEY_ID = ENV_ACCESS_KEY_ID  
SECRET_ACCESS_KEY = ENV_SECRET_ACCESS_KEY
BUCKET_NAME = ENV_BUCKET_NAME
R2_ENDPOINT = f"https://{ENV_ACCOUNT_ID}.r2.cloudflarestorage.com" if ENV_ACCOUNT_ID else None


async def upload_file_to_r2(
    file_content: bytes,
    file_key: str,
    content_type: str = 'application/pdf'
) -> dict:
    """
    Upload a file to Cloudflare R2 bucket.
    
    Args:
        file_content: The binary content of the file
        file_key: The key (path) to store the file as in R2
        content_type: MIME type of the file
    
    Returns:
        Dictionary containing success status and file location
    """
    # Get fresh settings from database
    settings = await get_r2_settings()
    
    if not settings.get("account_id") or not settings.get("access_key_id"):
        return {
            'success': False,
            'error': 'R2 ayarları yapılandırılmamış. Sistem ayarlarından Cloudflare R2 bağlantısını yapın.'
        }
    
    try:
        endpoint = f"https://{settings['account_id']}.r2.cloudflarestorage.com"
        client = boto3.client(
            's3',
            endpoint_url=endpoint,
            aws_access_key_id=settings['access_key_id'],
            aws_secret_access_key=settings['secret_access_key'],
            region_name='auto',
            config=Config(signature_version='s3v4')
        )
        
        client.put_object(
            Bucket=settings['bucket_name'],
            Key=file_key,
            Body=file_content,
            ContentType=content_type
        )
        
        logger.info(f'Successfully uploaded {file_key} to R2')
        return {
            'success': True,
            'file_key': file_key,
            'bucket': settings['bucket_name']
        }
    except ClientError as e:
        logger.error(f'Error uploading {file_key} to R2: {str(e)}')
        return {
            'success': False,
            'error': str(e)
        }


async def download_file_from_r2(file_key: str) -> Optional[bytes]:
    """
    Download a file from Cloudflare R2 bucket.
    
    Args:
        file_key: The key (path) of the file to download
    
    Returns:
        The file content as bytes, or None if download fails
    """
    settings = await get_r2_settings()
    
    if not settings.get("account_id") or not settings.get("access_key_id"):
        logger.error("R2 settings not configured")
        return None
    
    try:
        endpoint = f"https://{settings['account_id']}.r2.cloudflarestorage.com"
        client = boto3.client(
            's3',
            endpoint_url=endpoint,
            aws_access_key_id=settings['access_key_id'],
            aws_secret_access_key=settings['secret_access_key'],
            region_name='auto',
            config=Config(signature_version='s3v4')
        )
        
        response = client.get_object(Bucket=settings['bucket_name'], Key=file_key)
        file_content = response['Body'].read()
        
        logger.info(f'Successfully downloaded {file_key} from R2')
        return file_content
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', '')
        if error_code == 'NoSuchKey':
            logger.warning(f'File not found in R2: {file_key}')
        else:
            logger.error(f'Error downloading {file_key} from R2: {str(e)}')
        return None


async def delete_file_from_r2(file_key: str) -> bool:
    """
    Delete a file from Cloudflare R2 bucket.
    
    Args:
        file_key: The key (path) of the file to delete
    
    Returns:
        True if deletion was successful, False otherwise
    """
    settings = await get_r2_settings()
    
    if not settings.get("account_id") or not settings.get("access_key_id"):
        logger.error("R2 settings not configured")
        return False
    
    try:
        endpoint = f"https://{settings['account_id']}.r2.cloudflarestorage.com"
        client = boto3.client(
            's3',
            endpoint_url=endpoint,
            aws_access_key_id=settings['access_key_id'],
            aws_secret_access_key=settings['secret_access_key'],
            region_name='auto',
            config=Config(signature_version='s3v4')
        )
        
        client.delete_object(Bucket=settings['bucket_name'], Key=file_key)
        logger.info(f'Successfully deleted {file_key} from R2')
        return True
    except ClientError as e:
        logger.error(f'Error deleting {file_key} from R2: {str(e)}')
        return False


def generate_presigned_url(
    file_key: str,
    operation: str = 'get_object',
    expiration: int = 3600
) -> Optional[str]:
    """
    Generate a presigned URL for accessing a file in R2.
    
    Args:
        file_key: The key (path) of the file
        operation: The S3 operation ('get_object' or 'put_object')
        expiration: URL validity duration in seconds (default 1 hour)
    
    Returns:
        The presigned URL as a string, or None if generation fails
    """
    settings = get_r2_settings_sync()
    
    if not settings.get("account_id") or not settings.get("access_key_id"):
        return None
    
    try:
        endpoint = f"https://{settings['account_id']}.r2.cloudflarestorage.com"
        client = boto3.client(
            's3',
            endpoint_url=endpoint,
            aws_access_key_id=settings['access_key_id'],
            aws_secret_access_key=settings['secret_access_key'],
            region_name='auto',
            config=Config(signature_version='s3v4')
        )
        
        url = client.generate_presigned_url(
            ClientMethod=operation,
            Params={
                'Bucket': settings['bucket_name'],
                'Key': file_key
            },
            ExpiresIn=expiration
        )
        
        logger.info(f'Generated presigned {operation} URL for {file_key}')
        return url
    except ClientError as e:
        logger.error(f'Error generating presigned URL: {str(e)}')
        return None


async def delete_file_from_r2(file_key: str) -> bool:
    """
    Delete a file from Cloudflare R2 bucket.
    
    Args:
        file_key: The key (path) of the file to delete
    
    Returns:
        True if deletion was successful, False otherwise
    """
    client = get_r2_client()
    
    try:
        client.delete_object(Bucket=BUCKET_NAME, Key=file_key)
        logger.info(f'Successfully deleted {file_key} from R2')
        return True
    except ClientError as e:
        logger.error(f'Error deleting {file_key} from R2: {str(e)}')
        return False


def check_file_exists(file_key: str) -> bool:
    """
    Check if a file exists in R2 bucket.
    
    Args:
        file_key: The key (path) of the file to check
    
    Returns:
        True if file exists, False otherwise
    """
    client = get_r2_client()
    
    try:
        client.head_object(Bucket=BUCKET_NAME, Key=file_key)
        return True
    except ClientError:
        return False
