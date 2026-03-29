"""
Chat/Messaging System Router
Supports: Admin-Courier, Admin-Admin, Courier-Courier messaging
Features: Text, Images, Files, Group chats, Real-time notifications
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timezone
import uuid
import os
import base64

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ

from utils.jwt_utils import require_auth
router = APIRouter(prefix="/api/chat", tags=["Chat"], dependencies=[Depends(require_auth)])

# Active WebSocket connections
active_connections: Dict[str, List[WebSocket]] = {}


# ============ MODELS ============

class CreateConversationRequest(BaseModel):
    participant_ids: List[str]  # User IDs
    participant_names: List[str]  # User names for display
    participant_roles: List[str]  # "admin" or "courier"
    is_group: bool = False
    group_name: Optional[str] = None
    company_id: str


class SendMessageRequest(BaseModel):
    conversation_id: str
    sender_id: str
    sender_name: str
    sender_role: str  # "admin" or "courier"
    content: str
    message_type: str = "text"  # text, image, file
    file_url: Optional[str] = None
    file_name: Optional[str] = None


# ============ WEBSOCKET MANAGER ============

async def connect_user(user_id: str, websocket: WebSocket):
    await websocket.accept()
    if user_id not in active_connections:
        active_connections[user_id] = []
    active_connections[user_id].append(websocket)


def disconnect_user(user_id: str, websocket: WebSocket):
    if user_id in active_connections:
        if websocket in active_connections[user_id]:
            active_connections[user_id].remove(websocket)
        if not active_connections[user_id]:
            del active_connections[user_id]


async def send_to_user(user_id: str, message: dict):
    """Send message to all connections of a user"""
    if user_id in active_connections:
        disconnected = []
        for ws in active_connections[user_id]:
            try:
                await ws.send_json(message)
            except:
                disconnected.append(ws)
        for ws in disconnected:
            active_connections[user_id].remove(ws)


async def broadcast_to_conversation(conversation_id: str, message: dict, exclude_user: str = None):
    """Send message to all participants of a conversation"""
    conv = await db.chat_conversations.find_one({"id": conversation_id}, {"_id": 0})
    if conv:
        for participant_id in conv.get("participant_ids", []):
            if participant_id != exclude_user:
                await send_to_user(participant_id, message)


# ============ ENDPOINTS ============

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """WebSocket connection for real-time messaging"""
    await connect_user(user_id, websocket)
    try:
        while True:
            # Keep connection alive, handle incoming messages if needed
            data = await websocket.receive_text()
            # Can handle typing indicators, read receipts here
    except WebSocketDisconnect:
        disconnect_user(user_id, websocket)


@router.post("/conversations")
async def create_conversation(data: CreateConversationRequest):
    """Create a new conversation (1-1 or group)"""
    # For 1-1 chat, check if conversation already exists
    if not data.is_group and len(data.participant_ids) == 2:
        existing = await db.chat_conversations.find_one({
            "participant_ids": {"$all": data.participant_ids, "$size": 2},
            "is_group": False,
            "company_id": data.company_id
        }, {"_id": 0})
        if existing:
            return existing
    
    conversation = {
        "id": str(uuid.uuid4()),
        "company_id": data.company_id,
        "participant_ids": data.participant_ids,
        "participant_names": data.participant_names,
        "participant_roles": data.participant_roles,
        "is_group": data.is_group,
        "group_name": data.group_name if data.is_group else None,
        "last_message": None,
        "last_message_at": None,
        "created_at": get_turkey_now(),
        "created_by": data.participant_ids[0] if data.participant_ids else None
    }
    
    await db.chat_conversations.insert_one(conversation)
    # Remove MongoDB _id before returning
    conversation.pop("_id", None)
    return conversation


@router.get("/conversations/{user_id}")
async def get_user_conversations(user_id: str, company_id: str):
    """Get all conversations for a user"""
    conversations = await db.chat_conversations.find(
        {
            "participant_ids": user_id,
            "company_id": company_id
        },
        {"_id": 0}
    ).sort("last_message_at", -1).to_list(100)
    
    # Add unread count for each conversation
    for conv in conversations:
        unread = await db.chat_messages.count_documents({
            "conversation_id": conv["id"],
            "sender_id": {"$ne": user_id},
            "read_by": {"$nin": [user_id]}
        })
        conv["unread_count"] = unread
    
    return conversations


@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: str, limit: int = 50, before: str = None):
    """Get messages for a conversation"""
    query = {"conversation_id": conversation_id}
    if before:
        query["created_at"] = {"$lt": before}
    
    messages = await db.chat_messages.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return list(reversed(messages))


@router.post("/messages")
async def send_message(data: SendMessageRequest):
    """Send a new message"""
    now = get_turkey_now()
    
    message = {
        "id": str(uuid.uuid4()),
        "conversation_id": data.conversation_id,
        "sender_id": data.sender_id,
        "sender_name": data.sender_name,
        "sender_role": data.sender_role,
        "content": data.content,
        "message_type": data.message_type,
        "file_url": data.file_url,
        "file_name": data.file_name,
        "read_by": [data.sender_id],
        "created_at": now
    }
    
    await db.chat_messages.insert_one(message)
    
    # Update conversation's last message
    last_message_preview = data.content[:50] if data.message_type == "text" else f"📎 {data.file_name or 'Dosya'}"
    await db.chat_conversations.update_one(
        {"id": data.conversation_id},
        {"$set": {
            "last_message": last_message_preview,
            "last_message_at": now,
            "last_sender_name": data.sender_name
        }}
    )
    
    # Broadcast to all participants via WebSocket
    await broadcast_to_conversation(
        data.conversation_id,
        {
            "type": "new_message",
            "message": {k: v for k, v in message.items() if k != "_id"}
        },
        exclude_user=data.sender_id
    )
    
    # Create notification for other participants
    conv = await db.chat_conversations.find_one({"id": data.conversation_id}, {"_id": 0})
    if conv:
        for participant_id in conv.get("participant_ids", []):
            if participant_id != data.sender_id:
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()),
                    "company_id": conv.get("company_id"),
                    "user_id": participant_id,
                    "type": "chat_message",
                    "title": f"Yeni mesaj: {data.sender_name}",
                    "message": last_message_preview,
                    "data": {
                        "conversation_id": data.conversation_id,
                        "message_id": message["id"]
                    },
                    "read": False,
                    "created_at": now
                })
    
    # Remove MongoDB _id before returning
    message.pop("_id", None)
    return message


@router.post("/messages/{message_id}/read")
async def mark_message_read(message_id: str, user_id: str):
    """Mark a message as read"""
    await db.chat_messages.update_one(
        {"id": message_id},
        {"$addToSet": {"read_by": user_id}}
    )
    return {"message": "OK"}


@router.post("/conversations/{conversation_id}/read-all")
async def mark_all_read(conversation_id: str, user_id: str):
    """Mark all messages in a conversation as read"""
    await db.chat_messages.update_many(
        {"conversation_id": conversation_id},
        {"$addToSet": {"read_by": user_id}}
    )
    return {"message": "OK"}


@router.post("/upload")
async def upload_chat_file(
    file: UploadFile = File(...),
    conversation_id: str = Form(...),
    sender_id: str = Form(...)
):
    """Upload a file for chat (image or document)"""
    # Create uploads directory if not exists
    upload_dir = "/app/uploads/chat"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    unique_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(upload_dir, unique_filename)
    
    # Save file
    content = await file.read()
    
    # Boyut kontrolü - Chat dosyası max 10MB
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Dosya boyutu 10MB'ı geçemez")
    
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Generate URL
    file_url = f"/api/chat/files/{unique_filename}"
    
    return {
        "file_url": file_url,
        "file_name": file.filename,
        "file_size": len(content)
    }


@router.get("/files/{filename}")
async def get_chat_file(filename: str):
    """Serve uploaded chat files"""
    from fastapi.responses import FileResponse
    file_path = f"/app/uploads/chat/{filename}"
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="Dosya bulunamadı")


@router.get("/unread-count/{user_id}")
async def get_unread_count(user_id: str, company_id: str):
    """Get total unread message count for a user"""
    # Get user's conversations
    conversations = await db.chat_conversations.find(
        {"participant_ids": user_id, "company_id": company_id},
        {"_id": 0, "id": 1}
    ).to_list(100)
    
    conv_ids = [c["id"] for c in conversations]
    
    unread = await db.chat_messages.count_documents({
        "conversation_id": {"$in": conv_ids},
        "sender_id": {"$ne": user_id},
        "read_by": {"$nin": [user_id]}
    })
    
    return {"count": unread}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user_id: str):
    """Delete/Leave a conversation"""
    conv = await db.chat_conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Sohbet bulunamadı")
    
    if conv.get("is_group"):
        # For groups, just remove the user
        await db.chat_conversations.update_one(
            {"id": conversation_id},
            {"$pull": {"participant_ids": user_id}}
        )
        return {"message": "Gruptan ayrıldınız"}
    else:
        # For 1-1, delete the conversation and messages
        await db.chat_conversations.delete_one({"id": conversation_id})
        await db.chat_messages.delete_many({"conversation_id": conversation_id})
        return {"message": "Sohbet silindi"}


@router.get("/users/search")
async def search_users(company_id: str, query: str, current_user_id: str):
    """Search for users to start a conversation"""
    q = query.lower()
    
    # Search in admins
    admins = await db.admins.find(
        {
            "company_id": company_id,
            "name": {"$regex": q, "$options": "i"},
            "id": {"$ne": current_user_id}
        },
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(20)
    
    for a in admins:
        a["role"] = "admin"
    
    # Search in couriers (via company_couriers)
    courier_relations = await db.company_couriers.find(
        {
            "company_id": company_id,
            "$and": [
                {"$or": [{"is_active": {"$exists": False}}, {"is_active": True}]},
                {"$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}]}
            ]
        },
        {"_id": 0, "courier_id": 1}
    ).to_list(500)
    
    courier_ids = [r["courier_id"] for r in courier_relations]
    
    couriers = await db.couriers.find(
        {
            "id": {"$in": courier_ids, "$ne": current_user_id},
            "name": {"$regex": q, "$options": "i"}
        },
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(20)
    
    for c in couriers:
        c["role"] = "courier"
    
    return admins + couriers
