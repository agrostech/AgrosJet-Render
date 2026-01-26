"""
Cloudflare R2 Storage Service
Handles file upload, download, and presigned URL generation for invoices and documents.
"""
import os
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# R2 Configuration
ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
ACCESS_KEY_ID = os.getenv("CLOUDFLARE_ACCESS_KEY_ID")
SECRET_ACCESS_KEY = os.getenv("CLOUDFLARE_SECRET_ACCESS_KEY")
BUCKET_NAME = os.getenv("CLOUDFLARE_BUCKET_NAME", "shiftjet")
R2_ENDPOINT = f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com"


def get_r2_client():
    """
    Create and return a configured boto3 S3 client for Cloudflare R2.
    Uses signature_version='s3v4' for proper presigned URL generation.
    """
    return boto3.client(
        's3',
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=ACCESS_KEY_ID,
        aws_secret_access_key=SECRET_ACCESS_KEY,
        region_name='auto',
        config=Config(signature_version='s3v4')
    )


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
    client = get_r2_client()
    
    try:
        client.put_object(
            Bucket=BUCKET_NAME,
            Key=file_key,
            Body=file_content,
            ContentType=content_type
        )
        
        logger.info(f'Successfully uploaded {file_key} to R2')
        return {
            'success': True,
            'file_key': file_key,
            'bucket': BUCKET_NAME
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
    client = get_r2_client()
    
    try:
        response = client.get_object(Bucket=BUCKET_NAME, Key=file_key)
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
    client = get_r2_client()
    
    try:
        url = client.generate_presigned_url(
            ClientMethod=operation,
            Params={
                'Bucket': BUCKET_NAME,
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
