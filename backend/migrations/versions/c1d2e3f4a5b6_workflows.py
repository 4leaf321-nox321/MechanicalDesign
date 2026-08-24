"""워크플로 — 카드를 이어 값이 흐르게 한다

표 넷을 더한다. 기존 표는 건드리지 않으므로 이 마이그레이션은 어떤 행도 바꾸지
않는다 — 적용 전후로 카드·조직·기록은 그대로다.

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
"""

import sqlalchemy as sa
from alembic import op

revision = 'c1d2e3f4a5b6'
down_revision = 'b0c1d2e3f4a5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'workflows',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('route', sa.String(length=200), nullable=False, unique=True),
        sa.Column('color', sa.String(length=7), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('home_org_slug', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='draft'),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.Column('published_by_id', sa.Integer(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['published_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['home_org_slug'], ['organizations.slug'],
                                ondelete='SET NULL'),
    )
    op.create_index('ix_workflows_home_org_slug', 'workflows', ['home_org_slug'])
    op.create_index('ix_workflows_deleted_at', 'workflows', ['deleted_at'])

    op.create_table(
        'workflow_mounts',
        sa.Column('workflow_id', sa.Integer(), primary_key=True),
        sa.Column('org_slug', sa.String(length=64), primary_key=True),
        sa.Column('mounted_by_id', sa.Integer(), nullable=True),
        sa.Column('mounted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['org_slug'], ['organizations.slug'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['mounted_by_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_workflow_mounts_org_slug', 'workflow_mounts', ['org_slug'])

    op.create_table(
        'workflow_nodes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('workflow_id', sa.Integer(), nullable=False),
        sa.Column('card_id', sa.Integer(), nullable=False),
        sa.Column('alias', sa.String(length=100), nullable=False, server_default=''),
        sa.Column('layout_x', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('layout_y', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('inputs', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='CASCADE'),
        # **RESTRICT 다.** 카드가 사라지면 이 자리가 통째로 뜻을 잃는데, CASCADE
        # 로 지우면 워크플로가 조용히 반쪽이 된다. 앱이 먼저 친절히 막고, 이것은
        # 그 뒤의 마지막 방어선이다.
        sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ondelete='RESTRICT'),
    )
    op.create_index('ix_workflow_nodes_workflow_id', 'workflow_nodes', ['workflow_id'])
    op.create_index('ix_workflow_nodes_card_id', 'workflow_nodes', ['card_id'])

    op.create_table(
        'workflow_links',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('workflow_id', sa.Integer(), nullable=False),
        sa.Column('from_node_id', sa.Integer(), nullable=False),
        sa.Column('from_variable_id', sa.Integer(), nullable=False),
        sa.Column('from_label', sa.String(length=160), nullable=False, server_default=''),
        sa.Column('to_node_id', sa.Integer(), nullable=False),
        sa.Column('to_variable_id', sa.Integer(), nullable=False),
        sa.Column('to_label', sa.String(length=160), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['from_node_id'], ['workflow_nodes.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['to_node_id'], ['workflow_nodes.id'],
                                ondelete='CASCADE'),
        # **한 입력에는 연결이 하나만.** 둘이 들어오면 어느 값이 이기는지 알 수
        # 없고, 그건 오류 없이 틀린 답이 나오는 종류다.
        sa.UniqueConstraint('to_node_id', 'to_variable_id',
                            name='uq_workflow_link_target'),
    )
    op.create_index('ix_workflow_links_workflow_id', 'workflow_links', ['workflow_id'])
    op.create_index('ix_workflow_links_from_node_id', 'workflow_links', ['from_node_id'])
    op.create_index('ix_workflow_links_to_node_id', 'workflow_links', ['to_node_id'])

    # 변수 id 에는 외래키를 걸지 않는다. 걸면 변수를 지울 때 CASCADE 로 연결이
    # 조용히 사라져, 배선이 하나 없어진 채로 워크플로가 계속 돈다. 행을 남겨 두면
    # 검증이 "이 연결이 가리키던 변수가 사라졌습니다" 라고 말할 수 있다.


def downgrade():
    op.drop_table('workflow_links')
    op.drop_table('workflow_nodes')
    op.drop_table('workflow_mounts')
    op.drop_index('ix_workflows_deleted_at', table_name='workflows')
    op.drop_index('ix_workflows_home_org_slug', table_name='workflows')
    op.drop_table('workflows')
