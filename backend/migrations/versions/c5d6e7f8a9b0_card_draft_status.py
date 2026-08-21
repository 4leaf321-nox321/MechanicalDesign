"""카드 초안 — 사람이 보기 전에는 게시되지 않는다.

밖에서 API 로(MCP·외부 AI) 만든 카드는 초안으로 들어간다. 저장이 됐다는 것과
그 계산이 공학적으로 맞다는 것은 전혀 다른 얘기인데, 카드는 사람이 설계 판단에
쓰는 것이라 그 사이에 사람 한 명이 반드시 있어야 한다.

**기본값은 published 다.** 초안이 없던 시절에 만들어진 카드가 이 마이그레이션
때문에 목록에서 사라지면, 마이그레이션이 데이터를 지운 것과 사용자 눈에는
똑같이 보인다.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
"""

import sqlalchemy as sa
from alembic import op

revision = 'c5d6e7f8a9b0'
down_revision = 'b4c5d6e7f8a9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cards', sa.Column('status', sa.String(length=20), nullable=False,
                                     server_default='published'))
    op.add_column('cards', sa.Column('published_at', sa.DateTime(), nullable=True))
    op.add_column('cards', sa.Column('published_by_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_cards_published_by_id_users', 'cards', 'users',
                          ['published_by_id'], ['id'], ondelete='SET NULL')

    # 목록 조회가 매번 status 로 거른다. 카드 수가 많지 않아 지금은 차이가 없지만,
    # 이 열은 앞으로 모든 카드 조회에 들어간다.
    op.create_index(op.f('ix_cards_status'), 'cards', ['status'])


def downgrade():
    op.drop_index(op.f('ix_cards_status'), table_name='cards')
    op.drop_constraint('fk_cards_published_by_id_users', 'cards', type_='foreignkey')
    op.drop_column('cards', 'published_by_id')
    op.drop_column('cards', 'published_at')
    op.drop_column('cards', 'status')
