"""카드 소프트 삭제 — 지운 카드는 휴지통으로 간다

카드 하나에 변수·컨테이너·이미지·변경 이력이 딸려 있다. 잘못 눌러 사라지면
되돌릴 방법이 없는데, 그런 실수는 대개 지운 다음 날 발견된다.

기존 카드는 전부 `deleted_at IS NULL` — 지워지지 않은 상태다. 이 마이그레이션은
컬럼만 더하고 어떤 행도 바꾸지 않는다.

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
"""

import sqlalchemy as sa
from alembic import op

revision = 'b0c1d2e3f4a5'
down_revision = 'a9b0c1d2e3f4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cards', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.add_column('cards', sa.Column('deleted_by_id', sa.Integer(), nullable=True))
    # 목록 조회마다 `deleted_at IS NULL` 이 붙는다. 카드가 수천 장이 될 일은
    # 없지만, 조건이 모든 조회에 들어가므로 색인을 둔다.
    op.create_index('ix_cards_deleted_at', 'cards', ['deleted_at'])
    # 지운 사람의 계정을 지워도 카드는 남는다 — 카드가 딸려 사라지면 안 된다.
    op.create_foreign_key('fk_cards_deleted_by', 'cards', 'users',
                          ['deleted_by_id'], ['id'], ondelete='SET NULL')


def downgrade():
    op.drop_constraint('fk_cards_deleted_by', 'cards', type_='foreignkey')
    op.drop_index('ix_cards_deleted_at', table_name='cards')
    op.drop_column('cards', 'deleted_by_id')
    op.drop_column('cards', 'deleted_at')
