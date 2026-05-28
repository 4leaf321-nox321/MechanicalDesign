"""add options_data column to variables

Revision ID: f6a7b8c9dae0
Revises: e5f6a7b8c9da
Create Date: 2026-04-22 00:20:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9dae0'
down_revision = 'e5f6a7b8c9da'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('variables', schema=None) as batch_op:
        batch_op.add_column(sa.Column('options_data', sa.Text(), nullable=True, server_default=''))


def downgrade():
    with op.batch_alter_table('variables', schema=None) as batch_op:
        batch_op.drop_column('options_data')
