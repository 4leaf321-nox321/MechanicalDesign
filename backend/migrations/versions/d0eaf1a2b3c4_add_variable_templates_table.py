"""add variable_templates table

Revision ID: d0eaf1a2b3c4
Revises: c9dae0f1a2b3
Create Date: 2026-04-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd0eaf1a2b3c4'
down_revision = 'c9dae0f1a2b3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'variable_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('var_type', sa.String(length=20), nullable=False),
        sa.Column('data', sa.Text(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', 'var_type', name='uq_template_name_per_type'),
    )


def downgrade():
    op.drop_table('variable_templates')
