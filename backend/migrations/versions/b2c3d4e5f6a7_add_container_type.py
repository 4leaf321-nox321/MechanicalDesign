"""add container_type to containers

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-15 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('containers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('container_type', sa.String(length=20), nullable=True, server_default='default'))


def downgrade():
    with op.batch_alter_table('containers', schema=None) as batch_op:
        batch_op.drop_column('container_type')
