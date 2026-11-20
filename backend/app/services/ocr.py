"""Document storage and text extraction service (pypdf -> pdf2image + pytesseract tha+eng, python-docx)."""

import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Tuple

from docx import Document as DocxDocument
from fastapi import HTTPException, UploadFile, status
from PIL import Image
from pypdf import PdfReader

from app.core.config import settings

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


def _sanitize_filename(filename: str) -> str:
    base = Path(filename or "document").name
    stem = re.sub(r"[^A-Za-z0-9ก-๙._-]+", "_", Path(base).stem).strip("._") or "document"
    ext = Path(base).suffix.lower()
    return f"{stem[:80]}{ext}"


def save_uploaded_file(upload_file: UploadFile) -> Tuple[str, Path, str]:
    """Persist uploaded file under settings.UPLOAD_DIR and return (stored_filename, abs_path, ext)."""
    original_name = upload_file.filename or "uploaded_file"
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"ไม่รองรับไฟล์นามสกุล '{ext}' (รองรับเฉพาะ PDF, DOCX และไฟล์รูปภาพ)",
        )

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = _sanitize_filename(original_name)
    stored_filename = f"{timestamp}_{uuid.uuid4().hex[:8]}_{safe_name}"
    dest_path = upload_dir / stored_filename

    with dest_path.open("wb") as out_f:
        while True:
            chunk = upload_file.file.read(1024 * 1024)
            if not chunk:
                break
            out_f.write(chunk)

    return stored_filename, dest_path, ext


def _ocr_image(image: Image.Image) -> str:
    try:
        import pytesseract
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ไม่พบไลบรารี pytesseract ในระบบ: {exc}",
        )

    try:
        return pytesseract.image_to_string(image, lang="tha+eng").strip()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "ไม่สามารถรัน Tesseract OCR (lang='tha+eng') ได้ กรุณาตรวจสอบว่าติดตั้ง "
                f"tesseract-ocr และชุดภาษาไทย (tesseract-langpack-tha) บนเซิร์ฟเวอร์แล้ว: {exc}"
            ),
        )


def _is_garbled_pdf_text(text: str) -> bool:
    """Detect broken ToUnicode CMap / legacy Thai PDF mojibake so we auto-fallback to Thai OCR."""
    compact = re.sub(r"\s+", "", text)
    total = len(compact)
    if total == 0:
        return True

    # Readable Thai (ก-๛) and standard Latin/digits
    readable = len(re.findall(r"[ก-๛A-Za-z0-9]", compact))
    # Common mojibake glyphs from broken Thai PDF CMaps: arrows, box-drawing, PUA, control/replacement
    weird_unicode = len(re.findall(r"[\u2190-\u27ff\ue000-\uf8ff\ufffd]", compact))
    # Dense noise punctuation (@, #, %, $, ^, `, <, >, ?, |, /, \)
    noise_punct = len(re.findall(r"[@#%$^`<>?|/\\]", compact))

    readable_ratio = readable / total
    weird_ratio = weird_unicode / total
    noise_ratio = noise_punct / total

    # Normal Thai/English official PDFs have >80% readable characters and <2% weird glyphs
    if readable_ratio < 0.65:
        return True
    if weird_ratio > 0.03:
        return True
    if noise_ratio > 0.12:
        return True
    return False


def _extract_from_pdf(file_path: Path, force_ocr: bool = False) -> Dict[str, object]:
    reader = PdfReader(str(file_path))
    page_count = len(reader.pages)
    extracted_pages = []

    if not force_ocr:
        for page in reader.pages:
            page_text = (page.extract_text() or "").strip()
            extracted_pages.append(page_text)

    combined_text = "\n\n".join(p for p in extracted_pages if p).strip()
    meaningful_chars = len(re.sub(r"\s+", "", combined_text))
    avg_chars_per_page = meaningful_chars / max(page_count, 1)
    garbled = _is_garbled_pdf_text(combined_text)

    # Fallback to Poppler (pdf2image) + Tesseract OCR (tha+eng) when PDF is scanned, text-sparse,
    # has broken Thai font encoding (mojibake), or force_ocr=True
    if force_ocr or meaningful_chars < 80 or avg_chars_per_page < 30 or garbled:
        try:
            from pdf2image import convert_from_path
        except ImportError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"ไม่พบไลบรารี pdf2image สำหรับแปลงหน้า PDF: {exc}",
            )

        os.makedirs(settings.TEMP_DIR, exist_ok=True)
        try:
            images = convert_from_path(
                str(file_path),
                dpi=200,
                output_folder=settings.TEMP_DIR,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "ไม่สามารถแปลงหน้า PDF เป็นรูปภาพด้วย Poppler (pdf2image) ได้ "
                    f"กรุณาตรวจสอบว่าติดตั้ง poppler-utils บนเซิร์ฟเวอร์แล้ว: {exc}"
                ),
            )

        ocr_pages = []
        for idx, img in enumerate(images, start=1):
            try:
                text_page = _ocr_image(img)
                if text_page:
                    ocr_pages.append(text_page)
            finally:
                img.close()

        ocr_text = "\n\n".join(ocr_pages).strip()
        return {
            "extracted_text": ocr_text or combined_text,
            "page_count": page_count,
            "used_ocr": True,
            "ingestion_type": "pdf_ocr",
        }

    return {
        "extracted_text": combined_text,
        "page_count": page_count,
        "used_ocr": False,
        "ingestion_type": "pdf_text",
    }


def _extract_from_docx(file_path: Path) -> Dict[str, object]:
    doc = DocxDocument(str(file_path))
    parts = []

    for para in doc.paragraphs:
        if para.text and para.text.strip():
            parts.append(para.text.strip())

    for table in doc.tables:
        for row in table.rows:
            row_cells = [cell.text.strip() for cell in row.cells if cell.text and cell.text.strip()]
            if row_cells:
                parts.append(" | ".join(row_cells))

    return {
        "extracted_text": "\n\n".join(parts).strip(),
        "page_count": max(1, len(parts) // 25 + 1),
        "used_ocr": False,
        "ingestion_type": "docx",
    }


def _extract_from_image(file_path: Path) -> Dict[str, object]:
    with Image.open(file_path) as img:
        text = _ocr_image(img)
    return {
        "extracted_text": text,
        "page_count": 1,
        "used_ocr": True,
        "ingestion_type": "pdf_ocr",
    }


def extract_document_text(file_path: Path, ext: str, force_ocr: bool = False) -> Dict[str, object]:
    """Dispatch text extraction based on file extension."""
    if ext == ".pdf":
        return _extract_from_pdf(file_path, force_ocr=force_ocr)
    if ext == ".docx":
        return _extract_from_docx(file_path)
    if ext in IMAGE_EXTENSIONS:
        return _extract_from_image(file_path)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"ไม่รองรับไฟล์นามสกุล '{ext}'",
    )
