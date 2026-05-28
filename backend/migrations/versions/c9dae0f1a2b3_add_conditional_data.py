"""add conditional_data column to variables

Revision ID: c9dae0f1a2b3
Revises: b8c9dae0f1a2
Create Date: 2026-04-22 00:50:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c9dae0f1a2b3'
down_revision = 'b8c9dae0f1a2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('variables', schema=None) as batch_op:
        batch_op.add_column(sa.Column('conditional_data', sa.Text(), nullable=True, server_default=''))


def downgrade():
    with op.batch_alter_table('variables', schema=None) as batch_op:
        batch_op.drop_column('conditional_data')
