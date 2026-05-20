# Render Deployment Guide

Bu repo Render'a deploy etmek için yapılandırılmıştır. İki ayrı servis çalıştırır: Backend (FastAPI) ve Frontend (React Static Site).

## Hızlı Başlangıç (Blueprint Yöntemi - Önerilen)

1. Render Dashboard'a giriş yapın → **"New +" → "Blueprint"** seçin
2. GitHub repo'nuzu seçin (bu fork'tan oluşturduğunuz repo)
3. Render `render.yaml` dosyasını otomatik algılayacak ve iki servis oluşturacak:
   - `sepettakip-backend` (Python web service)
   - `sepettakip-frontend` (Static site)
4. **"Apply"** tıklayın

## Environment Variables (ZORUNLU)

### Backend (`sepettakip-backend`) için Render dashboard'da girin:

| Key | Açıklama | Örnek Değer |
|-----|----------|-------------|
| `MONGO_URL` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true` |
| `DB_NAME` | MongoDB database adı | `sepettakip_prod` |
| `JWT_SECRET` | JWT secret key (rastgele uzun string) | `<güçlü-rastgele-string>` |
| `CORS_ORIGINS` | İzin verilen frontend URL'leri (virgülle) | `https://sepettakip-frontend.onrender.com` |
| `EMERGENT_LLM_KEY` | Emergent Universal Key | `sk-emergent-xxxx` |
| `SMTP_SERVER` | Gmail SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | Gmail adresi | `user@gmail.com` |
| `SMTP_PASSWORD` | Gmail App Password (normal şifre değil!) | `xxxx xxxx xxxx xxxx` |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key | — |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret | — |
| `R2_ENDPOINT` | Cloudflare R2 endpoint URL | — |
| `R2_BUCKET` | R2 bucket adı | — |
| `VATANSMS_API_ID` | VatanSMS API ID | — |
| `VATANSMS_API_KEY` | VatanSMS API key | — |
| `VATANSMS_SENDER` | VatanSMS sender adı | — |

### Frontend (`sepettakip-frontend`) için:

| Key | Açıklama | Örnek Değer |
|-----|----------|-------------|
| `REACT_APP_BACKEND_URL` | Backend servisinin public URL'i | `https://sepettakip-backend.onrender.com` |

## Önemli Notlar

- **Build sırası**: Frontend env (`REACT_APP_BACKEND_URL`) build-time'da gömülür. Backend deploy bittikten sonra frontend'i deploy edin.
- **Free Plan Uyarısı**: Free plan'da servisler 15 dk inaktivite sonrası uyur. Production için en az `starter` plan önerilir.
- **MongoDB**: Render MongoDB sağlamaz. MongoDB Atlas free tier kullanın.
- **Disk**: Geçici dosya yüklemeleri için ephemeral storage; kalıcı dosyalar Cloudflare R2'de saklanmalı.
- **Health Check**: Backend `/api/health` endpoint'i Render tarafından kontrol edilir.

## Manuel Deploy (Blueprint kullanmazsanız)

### Backend
- **Type**: Web Service
- **Root Directory**: `backend`
- **Runtime**: Python 3.11
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
- **Health Check Path**: `/api/health`

### Frontend
- **Type**: Static Site
- **Root Directory**: `frontend`
- **Build Command**: `yarn install && CI=false yarn build`
- **Publish Directory**: `build`
- **Rewrite Rule**: `/*` → `/index.html` (200)
