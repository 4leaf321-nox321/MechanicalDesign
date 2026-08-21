"""개인 액세스 토큰 — MCP·스크립트가 쓰는 기계용 자격 증명.

사람의 세션(refresh 쿠키 + 15분짜리 access)은 브라우저를 전제로 한다. 헤더
하나만 들고 붙는 클라이언트에는 쿠키를 둘 자리도 갱신을 돌릴 자리도 없어서,
오래 살고 스스로 만료되며 언제든 지울 수 있는 토큰을 따로 둔다.

원문은 저장하지 않는다 — 해시만 남으므로 DB 가 새어도 남의 토큰으로 붙을 수
없다. `token_hash` 에 unique 를 거는 것은 무결성보다 **조회 경로**를 위해서다.
인증할 때마다 이 열로 정확히 한 행을 찾는다.

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
"""

import sqlalchemy as sa
from alembic import op

revision = 'b4c5d6e7f8a9'
down_revision = 'a3b4c5d6e7f8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'personal_access_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        # 계정을 지우면 그 사람의 토큰도 함께 사라져야 한다. 남아 있으면 주인
        # 없는 자격 증명이 되고, 목록 어디에도 안 보이므로 회수할 수도 없다.
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('token_prefix', sa.String(length=16), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_personal_access_tokens_user_id'),
                    'personal_access_tokens', ['user_id'])
    op.create_index(op.f('ix_personal_access_tokens_token_hash'),
                    'personal_access_tokens', ['token_hash'], unique=True)


def downgrade():
    op.drop_index(op.f('ix_personal_access_tokens_token_hash'),
                  table_name='personal_access_tokens')
    op.drop_index(op.f('ix_personal_access_tokens_user_id'),
                  table_name='personal_access_tokens')
    op.drop_table('personal_access_tokens')
