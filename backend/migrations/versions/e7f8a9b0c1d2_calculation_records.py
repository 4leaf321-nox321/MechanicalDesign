"""계산 기록 — 그때 그 숫자가 무엇이었는지.

지금까지 계산은 브라우저에서 돌고 창을 닫으면 사라졌다. 그래서 "지난주 그
계산에 하중을 몇으로 넣었더라" 에 답할 방법이 없었다.

**정의 스냅샷을 함께 저장한다.** 입력과 결과만 남기면, 카드 수식이 바뀐 뒤에도
기록은 예전 숫자를 들고 있는데 카드를 열면 다른 계산이 나온다. 그 어긋남은
아무 오류도 내지 않아서, 기록을 믿고 설계 판단을 한 뒤에야 드러난다.

`card_id` 는 SET NULL 이다. 카드를 지워도 기록은 남아야 한다 — 기록이 남는
것이 이 표의 존재 이유다. 그래서 카드 이름도 베껴 둔다.

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
"""

import sqlalchemy as sa
from alembic import op

revision = 'e7f8a9b0c1d2'
down_revision = 'd6e7f8a9b0c1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'calculation_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('card_id', sa.Integer(), nullable=True),
        sa.Column('card_name', sa.String(length=100), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('inputs', sa.Text(), nullable=False),
        sa.Column('results', sa.Text(), nullable=False),
        sa.Column('definition_snapshot', sa.Text(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_calculation_records_card_id'),
                    'calculation_records', ['card_id'])
    # 목록이 항상 최신순이라 이 열로 정렬한다.
    op.create_index(op.f('ix_calculation_records_created_at'),
                    'calculation_records', ['created_at'])


def downgrade():
    op.drop_index(op.f('ix_calculation_records_created_at'),
                  table_name='calculation_records')
    op.drop_index(op.f('ix_calculation_records_card_id'),
                  table_name='calculation_records')
    op.drop_table('calculation_records')
