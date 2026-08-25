"""계산 기록에 워크플로도 담는다

지금까지 기록은 카드 하나의 계산이었다. 워크플로는 카드 여러 장을 이어 돌린
것이라 담을 자리가 없었다 — 돌릴 수는 있는데 남길 수 없으면 반쪽이다.

`kind` 로 갈라 두는 이유: 두 종류가 한 표에 있어야 "내가 한 계산" 을 한 목록에서
볼 수 있다. 표를 나누면 목록 화면이 둘을 합치는 일을 매번 다시 해야 하고, 정렬과
검색도 두 벌이 된다.

기존 행은 전부 `kind='card'` 로 채운다.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
"""

import sqlalchemy as sa
from alembic import op

revision = 'd2e3f4a5b6c7'
down_revision = 'c1d2e3f4a5b6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('calculation_records',
                  sa.Column('kind', sa.String(length=20), nullable=False,
                            server_default='card'))
    op.add_column('calculation_records',
                  sa.Column('workflow_id', sa.Integer(), nullable=True))
    op.add_column('calculation_records',
                  sa.Column('workflow_name', sa.String(length=100), nullable=True))

    # 워크플로가 지워져도 기록은 남는다. 카드와 같은 판단이다 — 기록이 남는 것이
    # 이 표의 존재 이유이므로, 가리키던 것이 사라졌다고 함께 없어지면 안 된다.
    op.create_foreign_key('fk_records_workflow', 'calculation_records', 'workflows',
                          ['workflow_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_calculation_records_workflow_id', 'calculation_records',
                    ['workflow_id'])

    # 워크플로 기록에는 카드 이름이 없다. 기존 행은 이미 값이 있으므로 이 완화가
    # 아무 행도 건드리지 않는다.
    op.alter_column('calculation_records', 'card_name',
                    existing_type=sa.String(length=100), nullable=True)


def downgrade():
    op.alter_column('calculation_records', 'card_name',
                    existing_type=sa.String(length=100), nullable=False)
    op.drop_index('ix_calculation_records_workflow_id',
                  table_name='calculation_records')
    op.drop_constraint('fk_records_workflow', 'calculation_records',
                       type_='foreignkey')
    op.drop_column('calculation_records', 'workflow_name')
    op.drop_column('calculation_records', 'workflow_id')
    op.drop_column('calculation_records', 'kind')
