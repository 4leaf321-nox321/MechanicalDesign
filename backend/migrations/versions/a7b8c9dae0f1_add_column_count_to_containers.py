"""add column_count to containers

Revision ID: a7b8c9dae0f1
Revises: f6a7b8c9dae0
Create Date: 2026-04-22 00:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a7b8c9dae0f1'
down_revision = 'f6a7b8c9dae0'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('containers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('column_count', sa.Integer(), nullable=True, server_default='1'))


def downgrade():
    with op.batch_alter_table('containers', schema=None) as batch_op:
        batch_op.drop_column('column_count')
