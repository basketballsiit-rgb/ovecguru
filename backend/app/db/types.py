from typing import Any, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON
from sqlalchemy.types import TypeDecorator


class EmbeddingVector(TypeDecorator):
    """Cross-dialect vector column type.

    - PostgreSQL (Production / Supabase / Docker pgvector): native `pgvector` Vector(dim).
    - SQLite (Zero-setup local Windows dev): JSON array of floats.
    """

    impl = JSON
    cache_ok = True

    def __init__(self, dim: int) -> None:
        super().__init__()
        self.dim = dim

    def load_dialect_impl(self, dialect: Any):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Vector(self.dim))
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value: Optional[list[float]], dialect: Any):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        return [float(x) for x in value]

    def process_result_value(self, value: Any, dialect: Any):
        if value is None:
            return None
        return list(value)
