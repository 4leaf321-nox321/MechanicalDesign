"""기록에 「어떻게 돌려서 나온 값인가」를 담을 칸.

정의 스냅샷과 나누어 둔다. 스냅샷은 **무엇을 계산했나**(서버가 뜬다), 이것은
**어떻게 계산했나**(화면이 보낸다). 지금은 반복 정보가 들어가고, 뒤에 다른
종류의 계산이 붙어도 여기에 담으면 된다.

기존 기록은 `NULL` 이다. 없는 것이지 0 회 돈 것이 아니므로 기본값을 두지 않는다.

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
"""

import sqlalchemy as sa
from alembic import op

revision = 'f4a5b6c7d8e9'
down_revision = 'e3f4a5b6c7d8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('calculation_records') as batch:
        batch.add_column(sa.Column('run_meta', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('calculation_records') as batch:
        batch.drop_column('run_meta')
