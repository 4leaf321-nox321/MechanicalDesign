"""add table_data column to variables

Revision ID: e5f6a7b8c9da
Revises: d4e5f6a7b8c9
Create Date: 2026-04-22 00:10:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9da'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('variables', schema=None) as batch_op:
        batch_op.add_column(sa.Column('table_data', sa.Text(), nullable=True, server_default=''))


def downgrade():
    with op.batch_alter_table('variables', schema=None) as batch_op:
        batch_op.drop_column('table_data')
