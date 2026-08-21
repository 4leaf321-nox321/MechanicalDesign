"""카드에 AI 흔적을 남긴다.

게시하고 나면 사람이 손으로 짠 카드와 AI 가 초안을 잡은 카드가 똑같이 생겼다.
나중에 그 계산이 이상하다는 얘기가 나왔을 때 어디를 먼저 볼지가 달라지므로,
구분할 단서를 남긴다.

두 칸인 이유: `origin` 은 **누가 시작했는가**이고 한 번 정해지면 안 바뀐다.
그것만 두면 사람이 만든 카드를 AI 가 나중에 전부 고쳐도 계속 'human' 이라
그 칸이 거짓말을 하게 된다. `ai_touched_at` 은 **기계가 마지막으로 쓴 시각**이고
채워지기만 한다.

기본값은 'human' 이다. 이 마이그레이션 전에 만들어진 카드는 API 로 만들 수단
자체가 없었으므로 전부 사람이 만든 것이 맞다 — 값을 지어내는 것이 아니다.

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
"""

import sqlalchemy as sa
from alembic import op

revision = 'd6e7f8a9b0c1'
down_revision = 'c5d6e7f8a9b0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cards', sa.Column('origin', sa.String(length=20), nullable=False,
                                     server_default='human'))
    op.add_column('cards', sa.Column('ai_touched_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('cards', 'ai_touched_at')
    op.drop_column('cards', 'origin')
