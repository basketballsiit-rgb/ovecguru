#!/usr/bin/env python3
"""Initial database bootstrap and seed script for OVEC GURU (CentOS Stream 9 & Dev).

Creates pgvector extension (on PostgreSQL), builds all SQLAlchemy tables, and
seeds initial records ONLY when each target table is empty:
  1. Primary Super Admin account (credentials from .env)
  2. Default Governance Policy (id=1)
  3. 4 Main Document Type Groups + 4 Default Categories:
     - ระเบียบ/ประกาศ
     - หลักสูตร ปวช./ปวส.
     - การรับสมัคร
     - ข้อมูลสถานศึกษา

Usage:
    cd backend
    python seed.py
"""

import logging
import sys
from pathlib import Path
from typing import List, Tuple

from sqlalchemy import func, select

# Ensure `backend/` is on sys.path regardless of working directory
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.init_db import create_tables, enable_pgvector_extension  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    DocumentCategory,
    DocumentGroup,
    GovernancePolicy,
    User,
    UserRole,
    UserStatus,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ovec_guru.seed")

# 4 Main Document Type Groups + 4 Default Categories
INITIAL_GROUPS_AND_CATEGORIES: List[Tuple[str, str, str]] = [
    (
        "กฎหมาย ระเบียบ และประกาศ สอศ.",
        "พระราชบัญญัติ กฎกระทรวง ระเบียบ ข้อบังคับ และประกาศสำนักงานคณะกรรมการการอาชีวศึกษา",
        "ระเบียบ/ประกาศ",
    ),
    (
        "หลักสูตรและการจัดการเรียนการสอน",
        "โครงสร้างหลักสูตร ปวช. ปวส. ระบบทวิภาคี และการวัดประเมินผลการเรียน",
        "หลักสูตร ปวช./ปวส.",
    ),
    (
        "การรับสมัครและงานทะเบียนนักศึกษา",
        "เกณฑ์การรับสมัครนักศึกษาใหม่ โควตา ระบบรับตรง และงานทะเบียนสถานศึกษา",
        "การรับสมัคร",
    ),
    (
        "ข้อมูลสถานศึกษาและเครือข่ายอาชีวศึกษา",
        "ข้อมูลวิทยาลัยสังกัด สอศ. สาขาวิชาที่เปิดสอน และข้อมูลพื้นฐานสถานศึกษา",
        "ข้อมูลสถานศึกษา",
    ),
]


def seed_initial_data() -> None:
    """Create tables and seed default data safely when tables are empty."""
    logger.info("Starting OVEC GURU database seed...")
    enable_pgvector_extension()
    create_tables()

    with SessionLocal() as db:
        # 1. Seed Primary Super Admin if `users` table is empty
        user_count = db.scalar(select(func.count(User.id))) or 0
        if user_count == 0:
            admin_user = User(
                full_name=settings.INIT_SUPER_ADMIN_NAME,
                email=settings.INIT_SUPER_ADMIN_EMAIL.lower().strip(),
                password_hash=hash_password(settings.INIT_SUPER_ADMIN_PASSWORD),
                department=settings.INIT_SUPER_ADMIN_DEPARTMENT,
                role=UserRole.SUPER_ADMIN,
                status=UserStatus.ACTIVE,
                is_primary_super=True,
            )
            db.add(admin_user)
            db.commit()
            logger.info("Seeded Primary Super Admin: %s", admin_user.email)
        else:
            logger.info("Skipped users seed: %d user(s) already exist.", user_count)

        # 2. Seed Governance Policy if `governance_policies` table is empty
        policy_count = db.scalar(select(func.count(GovernancePolicy.id))) or 0
        if policy_count == 0:
            policy = GovernancePolicy(
                id=1,
                allow_knowledge_admin_manage_categories=False,
                allow_knowledge_admin_archive_docs=False,
                require_super_approve_for_ocr=True,
            )
            db.add(policy)
            db.commit()
            logger.info("Seeded default governance_policies (id=1).")
        else:
            logger.info("Skipped governance_policies seed: already initialized.")

        # 3. Seed 4 Document Groups + 4 Default Categories if `document_groups` is empty
        group_count = db.scalar(select(func.count(DocumentGroup.id))) or 0
        if group_count == 0:
            for group_name, group_desc, default_cat_name in INITIAL_GROUPS_AND_CATEGORIES:
                grp = DocumentGroup(name=group_name, description=group_desc)
                db.add(grp)
                db.flush()

                cat = DocumentCategory(
                    name=default_cat_name,
                    group_id=grp.id,
                    is_default=True,
                )
                db.add(cat)

            db.commit()
            logger.info(
                "Seeded 4 document_groups and 4 default document_categories."
            )
        else:
            logger.info("Skipped document taxonomy seed: %d group(s) already exist.", group_count)

    logger.info("OVEC GURU seed completed successfully.")


if __name__ == "__main__":
    seed_initial_data()
