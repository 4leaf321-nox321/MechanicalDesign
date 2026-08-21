"""계정과 세션 — users, refresh_tokens, cards.created_by_id

`cards.created_by_id` 는 nullable 이다. 이 마이그레이션이 도는 시점에 이미 있는
카드는 만든 사람을 알 방법이 없다 — 인증이 없던 때에 만들어졌기 때문이다. 값을
지어내지 않고 NULL 로 둔다.

`users` 를 먼저 만든다. `refresh_tokens` 와 `cards.created_by_id` 가 그것을
가리킨다.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-08-21
"""
from alembic import op
import sqlalchemy as sa


revision = 'f2a3b4c5d6e7'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=254), nullable=False),
        sa.Column('password_hash', sa.String(length=120), nullable=False),
        sa.Column('display_name', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False,
                  server_default='pending'),
        sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('must_change_password', sa.Boolean(), nullable=False,
                  server_default='false'),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column('decided_by_id', sa.Integer(), nullable=True),
        sa.Column('decision_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        # 자기 참조 외래키는 테이블이 생긴 뒤에 붙인다.
        sa.ForeignKeyConstraint(['decided_by_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('issued_at', sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('replaced_by_id', sa.Integer(), nullable=True),
        sa.Column('user_agent', sa.String(length=300), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['replaced_by_id'], ['refresh_tokens.id'],
                                ondelete='SET NULL'),
    )
    op.create_index('ix_refresh_tokens_user_id', 'refresh_tokens', ['user_id'])
    op.create_index('ix_refresh_tokens_token_hash', 'refresh_tokens',
                    ['token_hash'], unique=True)

    op.add_column('cards', sa.Column('created_by_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_cards_created_by_id_users', 'cards', 'users',
                          ['created_by_id'], ['id'], ondelete='SET NULL')


def downgrade():
    op.drop_constraint('fk_cards_created_by_id_users', 'cards', type_='foreignkey')
    op.drop_column('cards', 'created_by_id')

    op.drop_index('ix_refresh_tokens_token_hash', table_name='refresh_tokens')
    op.drop_index('ix_refresh_tokens_user_id', table_name='refresh_tokens')
    op.drop_table('refresh_tokens')

    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
