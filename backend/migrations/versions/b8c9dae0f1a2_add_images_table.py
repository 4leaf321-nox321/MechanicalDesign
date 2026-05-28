"""add images table

Revision ID: b8c9dae0f1a2
Revises: a7b8c9dae0f1
Create Date: 2026-04-22 00:40:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'b8c9dae0f1a2'
down_revision = 'a7b8c9dae0f1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'images',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('card_id', sa.Integer(), sa.ForeignKey('cards.id'), nullable=False),
        sa.Column('container_id', sa.Integer(), sa.ForeignKey('containers.id'), nullable=True),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('stored_name', sa.String(length=255), nullable=False),
        sa.Column('mime_type', sa.String(length=50), nullable=True, server_default='image/png'),
        sa.Column('sort_order', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_table('images')
