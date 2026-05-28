"""add interp_data column to variables

Revision ID: e1f2a3b4c5d6
Revises: d0eaf1a2b3c4
Create Date: 2026-04-29 00:01:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'e1f2a3b4c5d6'
down_revision = 'd0eaf1a2b3c4'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('variables', schema=None) as batch_op:
        batch_op.add_column(sa.Column('interp_data', sa.Text(), nullable=True, server_default=''))


def downgrade():
    with op.batch_alter_table('variables', schema=None) as batch_op:
        batch_op.drop_column('interp_data')
