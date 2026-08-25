"""노드 묶음 — 순서도에서 여러 노드를 한 상자로 두른다.

`workflow_nodes.group_id` 를 **`SET NULL`** 로 건다. 묶음을 지우는 것은 「이렇게
보지 않겠다」 는 뜻이지 노드를 버리겠다는 뜻이 아니다. `CASCADE` 로 두면 상자를
지웠을 뿐인데 계산이 사라진다.

계산에는 아무 영향이 없다 — 실행 순서는 배선이 정하고, 묶음은 사람이 보기
좋으라고 두는 것이다.

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
"""

import sqlalchemy as sa
from alembic import op

revision = 'a5b6c7d8e9f0'
down_revision = 'f4a5b6c7d8e9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'workflow_groups',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('workflow_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False,
                  server_default=''),
        sa.Column('color', sa.String(length=7), nullable=False,
                  server_default='#6c5ce7'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'],
                                ondelete='CASCADE'),
    )
    op.create_index('ix_workflow_groups_workflow_id', 'workflow_groups',
                    ['workflow_id'])

    with op.batch_alter_table('workflow_nodes') as batch:
        batch.add_column(sa.Column('group_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_workflow_nodes_group', 'workflow_groups',
                                 ['group_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_workflow_nodes_group_id', 'workflow_nodes', ['group_id'])


def downgrade():
    op.drop_index('ix_workflow_nodes_group_id', table_name='workflow_nodes')
    with op.batch_alter_table('workflow_nodes') as batch:
        batch.drop_constraint('fk_workflow_nodes_group', type_='foreignkey')
        batch.drop_column('group_id')

    op.drop_index('ix_workflow_groups_workflow_id', table_name='workflow_groups')
    op.drop_table('workflow_groups')
