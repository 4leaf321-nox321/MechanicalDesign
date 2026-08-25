"""워크플로를 노드로 — 한 자리에 카드 대신 워크플로를 놓는다.

「관로 계열」 을 한 번 짜 두고 여러 검토에서 다시 쓰는 일이 실제로 있다.

## 안쪽 자리를 가리키는 칸

배선이 하위 워크플로로 들어갈 때는 **그 안의 어느 노드**인지까지 적어야 한다.
변수 id 만으로는 못 짚는다 — 같은 카드가 안에서 두 자리에 놓이면 변수 id 가
똑같기 때문이다.

그리고 그 칸을 **비워 두지 않는다.** Postgres 는 NULL 끼리 안 부딪힌 것으로 쳐서,
비워 두면 유일 제약이 카드 노드의 「한 입력에 연결 하나」 를 조용히 놓친다.
카드 노드에서는 자기 자신을 적는다.

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
"""

import sqlalchemy as sa
from alembic import op

revision = 'b6c7d8e9f0a1'
down_revision = 'a5b6c7d8e9f0'
branch_labels = None
depends_on = None


def upgrade():
    # --- 노드: 카드 대신 워크플로 -------------------------------------------
    with op.batch_alter_table('workflow_nodes') as batch:
        # 이제 카드가 없을 수 있다 — 하위 워크플로를 가리키는 자리다.
        batch.alter_column('card_id', existing_type=sa.Integer(), nullable=True)
        batch.add_column(sa.Column('sub_workflow_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_workflow_nodes_sub', 'workflows',
                                 ['sub_workflow_id'], ['id'], ondelete='RESTRICT')
    op.create_index('ix_workflow_nodes_sub_workflow_id', 'workflow_nodes',
                    ['sub_workflow_id'])

    # --- 배선: 안쪽 자리 ----------------------------------------------------
    op.add_column('workflow_links',
                  sa.Column('from_inner_node_id', sa.Integer(), nullable=True))
    op.add_column('workflow_links',
                  sa.Column('to_inner_node_id', sa.Integer(), nullable=True))

    # 이미 있는 배선은 전부 카드 노드를 가리킨다 — 자기 자신을 적는다.
    op.execute('UPDATE workflow_links SET from_inner_node_id = from_node_id, '
               'to_inner_node_id = to_node_id')

    with op.batch_alter_table('workflow_links') as batch:
        batch.alter_column('from_inner_node_id', existing_type=sa.Integer(),
                           nullable=False)
        batch.alter_column('to_inner_node_id', existing_type=sa.Integer(),
                           nullable=False)
        # 안쪽 자리까지 넣어야 「한 입력에 연결 하나」 가 하위 워크플로에서도 산다.
        batch.drop_constraint('uq_workflow_link_target', type_='unique')
        batch.create_unique_constraint(
            'uq_workflow_link_target',
            ['to_node_id', 'to_inner_node_id', 'to_variable_id'])


def downgrade():
    with op.batch_alter_table('workflow_links') as batch:
        batch.drop_constraint('uq_workflow_link_target', type_='unique')
        batch.create_unique_constraint('uq_workflow_link_target',
                                       ['to_node_id', 'to_variable_id'])
        batch.drop_column('to_inner_node_id')
        batch.drop_column('from_inner_node_id')

    op.drop_index('ix_workflow_nodes_sub_workflow_id',
                  table_name='workflow_nodes')
    with op.batch_alter_table('workflow_nodes') as batch:
        batch.drop_constraint('fk_workflow_nodes_sub', type_='foreignkey')
        batch.drop_column('sub_workflow_id')
        batch.alter_column('card_id', existing_type=sa.Integer(), nullable=False)
