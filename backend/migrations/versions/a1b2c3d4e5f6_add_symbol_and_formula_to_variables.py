"""add symbol and formula to variables

Revision ID: a1b2c3d4e5f6
Revises: ff99c29c690e
Create Date: 2026-04-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'ff99c29c690e'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('variables', schema=None) as batch_op:
        batch_op.add_column(sa.Column('symbol', sa.String(length=50), nullable=True, server_default=''))
        batch_op.add_column(sa.Column('formula', sa.String(length=500), nullable=True, server_default=''))


def downgrade():
    with op.batch_alter_table('variables', schema=None) as batch_op:
        batch_op.drop_column('formula')
        batch_op.drop_column('symbol')
