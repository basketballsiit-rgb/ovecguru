# OVEC GURU — ระบบแชตบอทอัจฉริยะ สอศ.

เว็บแอปพลิเคชันระบบแชตบอทอัจฉริยะสำหรับ **สำนักงานคณะกรรมการการอาชีวศึกษา (สอศ.)** ออกแบบตามข้อจำกัดของเซิร์ฟเวอร์จริงอย่างเคร่งครัด:

- **เซิร์ฟเวอร์เป้าหมาย:** CentOS Stream 9 | Intel Xeon X3440 (**ไม่มี AVX/AVX2**) | ไม่มี GPU | RAM ว่าง ~3.6 GB
- **นโยบายพื้นที่จัดเก็บ:** พาร์ทิชันหลัก (`/`) เหลือเพียง 4.7 GB จึงบังคับให้ไฟล์อัปโหลด, แคช pip/npm, ไฟล์ชั่วคราว, log, Python venv และฐานข้อมูล `pgdata` อยู่ภายใต้ **`/home/ovec_guru`** (พาร์ทิชัน `/home` ว่าง 384 GB) ทั้งหมด
- **Zero-AVX AI Architecture:** ไม่ติดตั้ง PyTorch หรือ `sentence-transformers` เชื่อมต่อทั้ง LLM (Streaming SSE) และ Embedding ผ่าน **OpenAI-compatible Cloud API** (รองรับ Gemini, OpenAI, Typhoon เพียงเปลี่ยนค่าใน `.env`)
- **Decoupled Stack:**
  - **Backend:** Python FastAPI + SQLAlchemy 2.0 + PostgreSQL + `pgvector` (รองรับทั้ง Supabase Cloud และ PostgreSQL Docker ในเครื่อง)
  - **Frontend:** React + Vite + Tailwind CSS คอมไพล์เป็น Static Build น้ำหนักเบา (~82 kB gzipped) เสิร์ฟผ่าน Nginx

---

## โครงสร้างโปรเจกต์

```text
/home/ovec_guru/
├── .env                          # ตั้งค่าจริง (คัดลอกจาก .env.example)
├── .env.example
├── backend/
│   ├── requirements.txt          # ไลบรารีน้ำหนักเบา ปราศจาก AVX
│   ├── seed.py                   # สคริปต์สร้างตาราง + Seed ข้อมูลตั้งต้น (Primary Super, Policy, 4 กลุ่ม, 4 หมวดหมู่)
│   └── app/
│       ├── core/                 # config.py, security.py (bcrypt + JWT)
│       ├── db/                   # base.py, session.py, types.py (pgvector/SQLite), init_db.py
│       ├── models/               # 7 ตาราง: users, governance_policies, document_groups, document_categories, documents, document_chunks, knowledge_gaps
│       ├── schemas/              # Pydantic request/response schemas
│       ├── services/             # ocr.py (pypdf + Poppler/Tesseract tha+eng), chunker.py, ai_client.py, rag.py
│       ├── api/                  # deps.py (RBAC + Governance) & routes (auth, admin_users, categories, documents, chat)
│       └── main.py               # FastAPI Entrypoint
├── frontend/                     # React + Vite + Tailwind CSS -> คอมไพล์เป็น frontend/dist/
└── deploy/
    ├── docker-compose.db.yml     # PostgreSQL 16 + pgvector (Volume ผูกที่ /home/ovec_guru/pgdata)
    ├── setup_centos9.sh          # สคริปต์ติดตั้งแพ็กเกจ + venv + seed + build บน CentOS Stream 9
    ├── ovec-guru-backend.service # Systemd service รัน Uvicorn เบื้องหลังอัตโนมัติ
    └── nginx-ovec-guru.conf      # Nginx Reverse Proxy (proxy_buffering off สำหรับ SSE Streaming)
```

---

## คู่มือติดตั้งขึ้นเซิร์ฟเวอร์จริง CentOS Stream 9

### 1. เตรียมโฟลเดอร์และอัปโหลดไฟล์โปรเจกต์ไปที่ `/home/ovec_guru`
อัปโหลดโฟลเดอร์ `backend/`, `frontend/`, `deploy/` และไฟล์ `.env.example` ไปไว้ที่ `/home/ovec_guru` จากนั้นสร้างไฟล์ `.env`:
```bash
cd /home/ovec_guru
cp .env.example .env
nano .env
```
ตั้งค่าสำคัญใน `.env` ให้ครบ:
- `DATABASE_URL` (ชี้ไปที่ PostgreSQL Docker ในเครื่อง หรือ Supabase Cloud)
- `AI_API_BASE_URL`, `AI_API_KEY`, `AI_CHAT_MODEL`, `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_DIMENSIONS`
- `UPLOAD_DIR="/home/ovec_guru/uploads"`
- `TEMP_DIR="/home/ovec_guru/tmp"`
- `JWT_SECRET` (สร้างค่าสุ่มใหม่ด้วย `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`)
- `INIT_SUPER_ADMIN_EMAIL` และ `INIT_SUPER_ADMIN_PASSWORD`

### 2. (ทางเลือก) เปิดฐานข้อมูล PostgreSQL + pgvector ในเครื่องด้วย Docker
*(ข้ามขั้นตอนนี้ได้หากใช้ Supabase Cloud)*
```bash
sudo mkdir -p /home/ovec_guru/pgdata
docker compose --env-file /home/ovec_guru/.env -f /home/ovec_guru/deploy/docker-compose.db.yml up -d
docker ps
```

### 3. รันสคริปต์ติดตั้งระบบ (`setup_centos9.sh`)
สคริปต์จะติดตั้ง `python3`, `tesseract`, `tesseract-langpack-tha`, `poppler-utils`, `nginx`, ตั้งค่า `PIP_CACHE_DIR`, `TMPDIR`, `npm_config_cache` ให้อยู่ใน `/home/ovec_guru` ทั้งหมด จากนั้นสร้าง Python `venv`, ติดตั้งไลบรารี, รัน `backend/seed.py` และคอมไพล์ Frontend:
```bash
chmod +x /home/ovec_guru/deploy/setup_centos9.sh
/home/ovec_guru/deploy/setup_centos9.sh
```

### 4. ติดตั้ง Systemd Service ให้ Backend รันอัตโนมัติทุกครั้งที่เปิดเครื่อง
*(ตรวจสอบให้แน่ใจว่ามี user `ovec_guru` หรือแก้ `User=` / `Group=` ในไฟล์ service ให้ตรงกับผู้ใช้บนเครื่อง)*
```bash
sudo cp /home/ovec_guru/deploy/ovec-guru-backend.service /etc/systemd/system/ovec-guru-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now ovec-guru-backend
sudo systemctl status ovec-guru-backend
```

### 5. ติดตั้ง Nginx Reverse Proxy (รองรับ SSE Streaming ไหลลื่น)
```bash
sudo cp /home/ovec_guru/deploy/nginx-ovec-guru.conf /etc/nginx/conf.d/ovec-guru.conf
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

### 6. เปิดสิทธิ์ SELinux และ Firewalld (จำเป็นมากบน CentOS Stream 9)
```bash
# 1) อนุญาตให้ Nginx เชื่อมต่อ Reverse Proxy ไปยัง FastAPI (127.0.0.1:8000)
sudo setsebool -P httpd_can_network_connect 1

# 2) อนุญาตให้ Nginx อ่านไฟล์ Static Frontend และเขียน temp/log ภายใต้ /home/ovec_guru
sudo setsebool -P httpd_enable_homedirs 1
sudo chmod o+x /home /home/ovec_guru /home/ovec_guru/frontend
sudo chcon -Rt httpd_sys_content_t /home/ovec_guru/frontend/dist
sudo chcon -Rt httpd_sys_rw_content_t /home/ovec_guru/tmp /home/ovec_guru/logs

# 3) เปิดพอร์ต HTTP / HTTPS บน Firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 7. ตรวจสอบความพร้อมหลังติดตั้ง
```bash
# ตรวจสอบ Backend + pgvector ผ่าน Nginx
curl -s http://127.0.0.1/api/health | python3 -m json.tool

# ตรวจสอบพื้นที่พาร์ทิชัน / และ /home
df -h / /home

# ดู log แบบเรียลไทม์หากต้องการตรวจสอบ
tail -f /home/ovec_guru/logs/backend.log /home/ovec_guru/logs/nginx_error.log
```

---

## การเปลี่ยนโลโก้ สอศ.
สามารถนำไฟล์โลโก้จริงชื่อ **`ovec-logo.png`** มาวางทับได้ที่ `frontend/public/assets/ovec-logo.png` (และใน Production ที่ `/home/ovec_guru/frontend/dist/assets/ovec-logo.png`) ระบบจะโหลดแสดงผลในกรอบเหรียญวงกลมพื้นขาวขลิบทองทันทีโดยไม่ต้องแก้โค้ด
