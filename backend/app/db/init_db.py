"""Automatic database table creation and idempotent seed script for OVEC GURU.

Usage (from `backend/` directory):
    python -m app.db.init_db
"""

import logging
from typing import Dict, List, Tuple

import bcrypt
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import Base
from app.db.session import SessionLocal, engine

# Import all models so SQLAlchemy registers every table on Base.metadata
from app.models import (  # noqa: F401
    Document,
    DocumentCategory,
    DocumentChunk,
    DocumentGroup,
    GovernancePolicy,
    KnowledgeGap,
    User,
    UserRole,
    UserStatus,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ovec_guru.init_db")


def hash_password(plain_password: str) -> str:
    """Hash a password with bcrypt directly (compatible with bcrypt 4.x/5.x and Python 3.9-3.14)."""
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

DEFAULT_DOCUMENT_TAXONOMY: List[Tuple[str, str, List[Tuple[str, bool]]]] = [
    (
        "กฎหมาย ระเบียบ และข้อบังคับ สอศ.",
        "พระราชบัญญัติ กฎกระทรวง ระเบียบ และประกาศสำนักงานคณะกรรมการการอาชีวศึกษา",
        [
            ("ระเบียบการจัดการศึกษาอาชีวศึกษา", True),
            ("พระราชบัญญัติและกฎหมายที่เกี่ยวข้อง", False),
            ("ประกาศและคำสั่ง สอศ.", False),
        ],
    ),
    (
        "หลักสูตรและการจัดการเรียนการสอน",
        "หลักสูตร ปวช. ปวส. ปริญญาตรีสายเทคโนโลยี การวัดผล และระบบทวิภาคี",
        [
            ("หลักสูตร ปวช. / ปวส.", False),
            ("การจัดการอาชีวศึกษาระบบทวิภาคี", False),
            ("การวัดและประเมินผลการเรียน", False),
        ],
    ),
    (
        "บริหารงานบุคคลและวิทยฐานะ",
        "การบรรจุแต่งตั้ง การย้าย การเลื่อนวิทยฐานะ สิทธิสวัสดิการ และวินัยข้าราชการครู",
        [
            ("วิทยฐานะและการประเมินตำแหน่ง", False),
            ("การลา สวัสดิการ และสิทธิประโยชน์", False),
            ("อัตรากำลังและการบรรจุแต่งตั้ง", False),
        ],
    ),
    (
        "การเงิน พัสดุ และงบประมาณ",
        "ระเบียบการจัดซื้อจัดจ้าง การเบิกจ่ายเงินอุดหนุน และเงินรายได้สถานศึกษา",
        [
            ("การจัดซื้อจัดจ้างและบริหารพัสดุ", False),
            ("เงินอุดหนุนและเงินรายได้สถานศึกษา", False),
            ("การเบิกจ่ายค่าใช้จ่ายในการฝึกอบรมและเดินทาง", False),
        ],
    ),
    (
        "กิจการนักเรียนนักศึกษาและสถานศึกษา",
        "องค์การนักวิชาชีพ ทุนการศึกษา กยศ. ความปลอดภัย และกิจกรรมพัฒนาผู้เรียน",
        [
            ("ทุนการศึกษาและ กยศ.", False),
            ("กิจกรรมองค์การนักวิชาชีพ (อวท.)", False),
            ("ทั่วไป / อื่น ๆ", True),
        ],
    ),
]


def enable_pgvector_extension() -> None:
    """Ensure the pgvector extension is enabled when running on PostgreSQL."""
    if engine.dialect.name != "postgresql":
        logger.info("Running on %s dialect; skipping pgvector extension step.", engine.dialect.name)
        return
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    logger.info("Verified PostgreSQL extension: vector (pgvector).")


def create_tables() -> None:
    """Create all SQLAlchemy tables defined in app.models."""
    Base.metadata.create_all(bind=engine)
    logger.info("Created/verified all SQLAlchemy tables.")

    if engine.dialect.name != "postgresql":
        return

    # Create HNSW cosine similarity index when vector dimension is within pgvector limit (<= 2000)
    if settings.AI_EMBEDDING_DIMENSIONS <= 2000:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_hnsw "
                    "ON document_chunks USING hnsw (embedding vector_cosine_ops)"
                )
            )
        logger.info("Verified HNSW cosine index on document_chunks.embedding.")
    else:
        logger.warning(
            "Skipping HNSW index creation: AI_EMBEDDING_DIMENSIONS=%s exceeds pgvector's 2000-dim HNSW limit.",
            settings.AI_EMBEDDING_DIMENSIONS,
        )


def seed_governance_policy(db: Session) -> None:
    """Ensure the singleton governance_policies row (id=1) exists."""
    policy = db.get(GovernancePolicy, 1)
    if policy is None:
        policy = GovernancePolicy(
            id=1,
            allow_knowledge_admin_manage_categories=False,
            allow_knowledge_admin_archive_docs=False,
            require_super_approve_for_ocr=True,
        )
        db.add(policy)
        db.commit()
        logger.info("Seeded default governance_policies record (id=1).")


def seed_document_taxonomy(db: Session) -> None:
    """Seed initial OVEC document groups and categories idempotently."""
    existing_groups: Dict[str, DocumentGroup] = {
        g.name: g for g in db.scalars(select(DocumentGroup)).all()
    }
    created_groups = 0
    created_categories = 0

    for group_name, group_desc, categories in DEFAULT_DOCUMENT_TAXONOMY:
        group = existing_groups.get(group_name)
        if group is None:
            group = DocumentGroup(name=group_name, description=group_desc)
            db.add(group)
            db.flush()
            existing_groups[group_name] = group
            created_groups += 1

        existing_cat_names = {
            c.name
            for c in db.scalars(
                select(DocumentCategory).where(DocumentCategory.group_id == group.id)
            ).all()
        }
        for cat_name, is_default in categories:
            if cat_name not in existing_cat_names:
                db.add(
                    DocumentCategory(
                        name=cat_name,
                        group_id=group.id,
                        is_default=is_default,
                    )
                )
                created_categories += 1

    db.commit()
    logger.info(
        "Document taxonomy check complete (added %d groups, %d categories).",
        created_groups,
        created_categories,
    )


def seed_primary_super_admin(db: Session) -> None:
    """Bootstrap the primary Super Admin account if none exists yet."""
    primary_super = db.scalar(select(User).where(User.is_primary_super.is_(True)))
    if primary_super is not None:
        logger.info("Primary Super Admin already exists (%s).", primary_super.email)
        return

    existing_email = db.scalar(select(User).where(User.email == settings.INIT_SUPER_ADMIN_EMAIL))
    if existing_email is not None:
        existing_email.role = UserRole.SUPER_ADMIN
        existing_email.is_primary_super = True
        existing_email.status = UserStatus.ACTIVE
        db.commit()
        logger.info("Promoted existing user %s to Primary Super Admin.", existing_email.email)
        return

    user = User(
        full_name=settings.INIT_SUPER_ADMIN_NAME,
        email=settings.INIT_SUPER_ADMIN_EMAIL,
        password_hash=hash_password(settings.INIT_SUPER_ADMIN_PASSWORD),
        department=settings.INIT_SUPER_ADMIN_DEPARTMENT,
        role=UserRole.SUPER_ADMIN,
        status=UserStatus.ACTIVE,
        is_primary_super=True,
    )
    db.add(user)
    db.commit()
    logger.info("Bootstrapped Primary Super Admin account: %s", user.email)


def init_db() -> None:
    """Run full database initialization (pgvector, tables, and default seed data)."""
    logger.info("Initializing OVEC GURU database...")
    enable_pgvector_extension()
    create_tables()

    with SessionLocal() as db:
        seed_governance_policy(db)
        seed_document_taxonomy(db)
        seed_primary_super_admin(db)

    logger.info("OVEC GURU database initialization completed successfully.")


if __name__ == "__main__":
    init_db()
