"""변경 이력 — 카드 정의가 언제 누구에 의해 어떻게 바뀌었나.

"게시 후 AI 수정됨" 이 뭔가 바뀌었다고는 말하는데 뭐가 바뀌었는지는 못 말했다.
그 표시를 본 사람이 할 수 있는 일은 수식을 눈으로 훑는 것뿐이었다.

**필드 단위 로그가 아니라 정의 스냅샷을 남긴다.** 로그만 있으면 "그 시점의
카드가 어떤 모습이었나" 를 되짚으려고 변경을 거꾸로 적용해야 하는데, 그 재구성은
한 번만 어긋나도 조용히 틀린 답을 준다.

카드를 지우면 이력도 함께 사라진다(CASCADE) — 없는 카드의 이력은 되짚을 대상이
없다. 그때의 계산이 필요하면 계산 기록이 자기 스냅샷을 따로 들고 있다.

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
"""

import sqlalchemy as sa
from alembic import op

revision = 'f8a9b0c1d2e3'
down_revision = 'e7f8a9b0c1d2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'card_revisions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('card_id', sa.Integer(), nullable=False),
        sa.Column('snapshot', sa.Text(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('changed_by_id', sa.Integer(), nullable=True),
        sa.Column('via_token', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['changed_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_card_revisions_card_id'), 'card_revisions', ['card_id'])


def downgrade():
    op.drop_index(op.f('ix_card_revisions_card_id'), table_name='card_revisions')
    op.drop_table('card_revisions')
