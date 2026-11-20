"""Structure-Aware Chunker tailored for Thai official regulations & OVEC documents.

Detects Thai structural headings at line starts:
- หมวด / หมวดที่ ...
- ส่วนที่ ...
- บทเฉพาะกาล
- ข้อ <number/Thai-numeral> ...

Splits oversized clauses on paragraph / line / sentence boundaries without cutting mid-sentence.
"""

import re
from typing import Dict, List, Optional

# Structural heading patterns for Thai government / OVEC official documents
SECTION_HEADER_RE = re.compile(
    r"^\s*((?:หมวด(?:ที่)?|ส่วนที่)\s*[0-9๐-๙]+[^\n]*|บทเฉพาะกาล[^\n]*)$"
)
CLAUSE_HEADER_RE = re.compile(
    r"^\s*(ข้อ\s*[0-9๐-๙]+(?:\.[0-9๐-๙]+)?(?:\s*[^\n]*)?)$"
)


def _normalize_text(raw_text: str) -> str:
    text = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    # Collapse excessive blank lines while preserving paragraph breaks
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split_long_block(text: str, max_chars: int = 1200, overlap_chars: int = 120) -> List[str]:
    """Split a long text block without cutting mid-sentence or mid-word."""
    cleaned = text.strip()
    if len(cleaned) <= max_chars:
        return [cleaned] if cleaned else []

    # 1) Try splitting by paragraphs first
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", cleaned) if p.strip()]
    if len(paragraphs) > 1:
        chunks: List[str] = []
        current = ""
        for para in paragraphs:
            if len(para) > max_chars:
                if current:
                    chunks.append(current.strip())
                    current = ""
                chunks.extend(_split_long_block(para, max_chars=max_chars, overlap_chars=overlap_chars))
                continue

            candidate = f"{current}\n\n{para}".strip() if current else para
            if len(candidate) <= max_chars:
                current = candidate
            else:
                if current:
                    chunks.append(current.strip())
                current = para
        if current:
            chunks.append(current.strip())
        return chunks

    # 2) Try splitting by single lines
    lines = [ln.strip() for ln in cleaned.split("\n") if ln.strip()]
    if len(lines) > 1:
        chunks = []
        current = ""
        for line in lines:
            if len(line) > max_chars:
                if current:
                    chunks.append(current.strip())
                    current = ""
                chunks.extend(_split_by_sentence_boundary(line, max_chars, overlap_chars))
                continue

            candidate = f"{current}\n{line}".strip() if current else line
            if len(candidate) <= max_chars:
                current = candidate
            else:
                if current:
                    chunks.append(current.strip())
                current = line
        if current:
            chunks.append(current.strip())
        return chunks

    # 3) Single long paragraph: split at natural sentence / whitespace boundaries
    return _split_by_sentence_boundary(cleaned, max_chars, overlap_chars)


def _split_by_sentence_boundary(text: str, max_chars: int, overlap_chars: int) -> List[str]:
    """Split a single long line at sentence/clause delimiters or spaces, never mid-word."""
    results: List[str] = []
    start = 0
    total_len = len(text)

    while start < total_len:
        end = min(start + max_chars, total_len)
        if end < total_len:
            window = text[start:end]
            # Prefer sentence endings or whitespace in the second half of the window
            min_cut = max(int(max_chars * 0.55), 1)
            cut_pos = -1
            for delim in (". ", "。", "; ", "\n", " "):
                pos = window.rfind(delim, min_cut)
                if pos > cut_pos:
                    cut_pos = pos + len(delim)
            if cut_pos > 0:
                end = start + cut_pos

        piece = text[start:end].strip()
        if piece:
            results.append(piece)

        if end >= total_len:
            break

        # Step back slightly for overlap, aligned to whitespace so we don't start mid-word
        next_start = max(end - overlap_chars, start + 1)
        if next_start < end:
            space_idx = text.find(" ", next_start, end)
            if space_idx != -1:
                next_start = space_idx + 1
        start = next_start

    return results


def chunk_thai_official_text(
    raw_text: str,
    max_chars: int = 1200,
    overlap_chars: int = 120,
) -> List[Dict[str, object]]:
    """Parse Thai official document text into structure-aware chunks.

    Returns a list of dicts:
        {"chunk_index": int, "clause_heading": Optional[str], "content_text": str, "char_count": int}
    """
    normalized = _normalize_text(raw_text)
    if not normalized:
        return []

    lines = normalized.split("\n")
    blocks: List[Dict[str, Optional[str]]] = []

    current_section: Optional[str] = None
    current_heading: Optional[str] = "บทนำ / หัวเรื่องเอกสาร"
    buffer_lines: List[str] = []

    def flush_buffer() -> None:
        nonlocal buffer_lines
        content = "\n".join(buffer_lines).strip()
        if content:
            blocks.append({"clause_heading": current_heading, "content_text": content})
        buffer_lines = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if buffer_lines and buffer_lines[-1] != "":
                buffer_lines.append("")
            continue

        section_match = SECTION_HEADER_RE.match(stripped)
        if section_match:
            flush_buffer()
            current_section = section_match.group(1).strip()
            current_heading = current_section
            buffer_lines.append(stripped)
            continue

        clause_match = CLAUSE_HEADER_RE.match(stripped)
        if clause_match:
            flush_buffer()
            # Keep short clause label (e.g. "ข้อ 5") and combine with active หมวด/ส่วนที่
            clause_token_match = re.match(r"^(ข้อ\s*[0-9๐-๙]+(?:\.[0-9๐-๙]+)?)", stripped)
            clause_label = clause_token_match.group(1).strip() if clause_token_match else stripped[:80]
            if current_section and not current_section.startswith("บทเฉพาะกาล"):
                current_heading = f"{current_section} > {clause_label}"
            elif current_section:
                current_heading = f"{current_section} > {clause_label}"
            else:
                current_heading = clause_label
            buffer_lines.append(stripped)
            continue

        buffer_lines.append(stripped)

    flush_buffer()

    final_chunks: List[Dict[str, object]] = []
    chunk_idx = 0

    for block in blocks:
        heading = block["clause_heading"]
        text_body = block["content_text"] or ""
        parts = _split_long_block(text_body, max_chars=max_chars, overlap_chars=overlap_chars)
        total_parts = len(parts)
        for part_no, part_text in enumerate(parts, start=1):
            part_heading = (
                f"{heading} (ส่วน {part_no}/{total_parts})" if (heading and total_parts > 1) else heading
            )
            final_chunks.append(
                {
                    "chunk_index": chunk_idx,
                    "clause_heading": part_heading,
                    "content_text": part_text,
                    "char_count": len(part_text),
                }
            )
            chunk_idx += 1

    return final_chunks
