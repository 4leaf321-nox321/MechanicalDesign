"""expand variables.category column to fit 'intermediate'

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('variables', schema=None) as batch_op:
        batch_op.alter_column(
            'category',
            existing_type=sa.String(length=10),
            type_=sa.String(length=20),
            existing_nullable=False,
        )


def downgrade():
    with op.batch_alter_table('variables', schema=None) as batch_op:
        batch_op.alter_column(
            'category',
            existing_type=sa.String(length=20),
            type_=sa.String(length=10),
            existing_nullable=False,
        )
