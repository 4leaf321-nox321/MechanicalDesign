"""add layout fields to containers

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-15 17:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('containers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('layout_x', sa.Integer(), nullable=True, server_default='0'))
        batch_op.add_column(sa.Column('layout_y', sa.Integer(), nullable=True, server_default='0'))
        batch_op.add_column(sa.Column('layout_w', sa.Integer(), nullable=True, server_default='6'))
        batch_op.add_column(sa.Column('layout_h', sa.Integer(), nullable=True, server_default='4'))


def downgrade():
    with op.batch_alter_table('containers', schema=None) as batch_op:
        batch_op.drop_column('layout_h')
        batch_op.drop_column('layout_w')
        batch_op.drop_column('layout_y')
        batch_op.drop_column('layout_x')
