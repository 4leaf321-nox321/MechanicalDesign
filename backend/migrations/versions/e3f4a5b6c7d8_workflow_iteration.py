"""워크플로 반복 설정 — 서로 물고 있는 노드를 돌려서 수렴시킬 때 쓰는 기준.

블록마다 두지 않고 워크플로 하나에 둔다. 반복 블록은 배선을 따라 생겼다
없어지므로, 블록에 매달아 두면 선 하나 끊는 순간 설정이 사라진다.

기본값은 「지금까지와 똑같이 동작하는」 값이 아니라 **웬만하면 잡히는** 값이다.
순환이 없는 워크플로는 이 값들을 아예 보지 않으므로 기존 것에 영향이 없다.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
"""

import sqlalchemy as sa
from alembic import op

revision = 'e3f4a5b6c7d8'
down_revision = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('workflows') as batch:
        batch.add_column(sa.Column('iter_tolerance', sa.Float(), nullable=False,
                                   server_default='0.000001'))
        batch.add_column(sa.Column('iter_max', sa.Integer(), nullable=False,
                                   server_default='200'))
        # 완화계수 w. 낮추면 보폭이 줄어 튀는 고리가 잡힌다. 실제 예제 둘을 재
        # 보니 최적값이 정반대로 나와서(축 자중은 1, 펌프 운전점은 0.6),
        # 가장 빠른 값이 아니라 가장 덜 실패하는 값으로 골랐다.
        batch.add_column(sa.Column('iter_relaxation', sa.Float(), nullable=False,
                                   server_default='0.7'))


def downgrade():
    with op.batch_alter_table('workflows') as batch:
        batch.drop_column('iter_relaxation')
        batch.drop_column('iter_max')
        batch.drop_column('iter_tolerance')
