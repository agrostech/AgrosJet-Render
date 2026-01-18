"""
Google Drive Service
Handles file uploads to Google Drive with folder structure
"""
import logging
from typing import Optional
from utils.database import db

logger = logging.getLogger(__name__)


def format_name_for_folder(name: str) -> str:
    """Format name for folder naming (keep Turkish chars but remove special chars)"""
    import re
    # Keep letters (including Turkish), numbers, spaces
    name = re.sub(r'[^\w\sğüşıöçĞÜŞİÖÇ]', '', name)
    return name.strip()


async def get_or_create_folder(service, folder_name: str, parent_id: str = None) -> str:
    """Get existing folder or create new one"""
    try:
        # Search for existing folder
        query = f"name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        if parent_id:
            query += f" and '{parent_id}' in parents"
        
        results = service.files().list(
            q=query,
            spaces='drive',
            fields='files(id, name)'
        ).execute()
        
        files = results.get('files', [])
        if files:
            return files[0]['id']
        
        # Create new folder
        file_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        if parent_id:
            file_metadata['parents'] = [parent_id]
        
        folder = service.files().create(
            body=file_metadata,
            fields='id'
        ).execute()
        
        logger.info(f"Created folder: {folder_name}")
        return folder.get('id')
        
    except Exception as e:
        logger.error(f"Error getting/creating folder: {str(e)}")
        return None


async def ensure_courier_folders(service, root_folder_id: str, courier_name: str) -> dict:
    """
    Ensure folder structure exists for a courier:
    ShiftJet/
    └── Kuryeler/
        └── {Kurye Adı}/
            ├── Evraklar/
            └── Faturalar/
    
    Returns dict with folder IDs
    """
    try:
        # Get or create Kuryeler folder
        kuryeler_id = await get_or_create_folder(service, "Kuryeler", root_folder_id)
        if not kuryeler_id:
            return None
        
        # Get or create courier folder
        formatted_name = format_name_for_folder(courier_name)
        courier_folder_id = await get_or_create_folder(service, formatted_name, kuryeler_id)
        if not courier_folder_id:
            return None
        
        # Get or create Evraklar folder
        evraklar_id = await get_or_create_folder(service, "Evraklar", courier_folder_id)
        
        # Get or create Faturalar folder
        faturalar_id = await get_or_create_folder(service, "Faturalar", courier_folder_id)
        
        return {
            "kuryeler": kuryeler_id,
            "courier": courier_folder_id,
            "evraklar": evraklar_id,
            "faturalar": faturalar_id
        }
        
    except Exception as e:
        logger.error(f"Error ensuring courier folders: {str(e)}")
        return None


async def upload_to_courier_folder(
    company_id: str,
    courier_name: str,
    folder_type: str,  # "evraklar" or "faturalar"
    file_bytes: bytes,
    file_name: str,
    mime_type: str = "application/pdf"
) -> Optional[dict]:
    """
    Upload file to courier's folder in Google Drive
    
    Args:
        company_id: Company ID
        courier_name: Courier's full name
        folder_type: "evraklar" or "faturalar"
        file_bytes: File content as bytes
        file_name: Name for the file
        mime_type: MIME type of the file
    
    Returns:
        dict with file_id, file_name, web_link or None if failed
    """
    try:
        # Import here to avoid circular imports
        from routers.google_integration import get_google_settings, get_drive_service
        import io
        from googleapiclient.http import MediaIoBaseUpload
        
        # Check if Drive is enabled
        settings = await get_google_settings(company_id)
        if not settings or not settings.get("drive_enabled"):
            logger.info(f"Drive not enabled for company {company_id}")
            return None
        
        # Check if Drive is connected
        creds = await db.google_credentials.find_one({"company_id": company_id, "service": "drive"})
        if not creds:
            logger.info(f"Drive not connected for company {company_id}")
            return None
        
        # Get Drive service
        service = await get_drive_service(company_id)
        
        # Get root folder ID from settings
        root_folder_id = settings.get("drive_folder_id")
        
        # Ensure folder structure exists
        folders = await ensure_courier_folders(service, root_folder_id, courier_name)
        if not folders:
            logger.error(f"Failed to create folder structure for courier {courier_name}")
            return None
        
        # Determine target folder
        target_folder_id = folders.get(folder_type)
        if not target_folder_id:
            logger.error(f"Target folder '{folder_type}' not found")
            return None
        
        # Upload file
        file_metadata = {
            'name': file_name,
            'parents': [target_folder_id]
        }
        
        media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type)
        
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink'
        ).execute()
        
        logger.info(f"Uploaded {file_name} to {folder_type} folder for {courier_name}")
        
        return {
            "file_id": file.get('id'),
            "file_name": file.get('name'),
            "web_link": file.get('webViewLink')
        }
        
    except Exception as e:
        logger.error(f"Failed to upload to courier folder: {str(e)}")
        return None
