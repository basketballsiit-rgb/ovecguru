const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

export function formatThaiDate(isoDate) {
  if (!isoDate) return "ไม่ระบุวันที่";
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  const day = parsed.getDate();
  const month = THAI_MONTHS_SHORT[parsed.getMonth()];
  const buddhistYear = parsed.getFullYear() + 543;
  return `${day} ${month} ${buddhistYear}`;
}

export function buildLineShareText({ question, answer, citation }) {
  const lines = ["📌 สรุปข้อมูลจาก OVEC GURU (สอศ.)"];
  if (question) {
    lines.push(`❓ คำถาม: ${question}`);
  }
  lines.push("");
  lines.push(answer.trim());

  if (citation) {
    lines.push("");
    lines.push("📄 แหล่งอ้างอิงอย่างเป็นทางการ:");
    lines.push(`• เอกสาร: ${citation.title}`);
    lines.push(`• หมวดหมู่: ${citation.category_name} (${citation.group_name})`);
    lines.push(`• ข้อมูลอัปเดตเมื่อ: ${formatThaiDate(citation.effective_date)} (บังคับใช้ล่าสุด)`);
    if (citation.cited_clauses?.length) {
      lines.push(`• หมวด/ข้อที่อ้างอิง: ${citation.cited_clauses.join(", ")}`);
    }
  }
  return lines.join("\n");
}
