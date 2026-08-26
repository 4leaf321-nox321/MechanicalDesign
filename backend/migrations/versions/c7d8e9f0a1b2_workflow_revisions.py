"""워크플로 개정 이력.

카드에는 이미 있고 워크플로에는 없었다. `card_revisions` 와 **같은 모양**으로
둔다 — 두 이력이 다르게 생기면 화면에서 나란히 놓인 두 목록이 서로 다른 것을
뜻하게 된다.

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-08-26
"""
import sqlalchemy as sa
from alembic import op

revision = 'c7d8e9f0a1b2'
down_revision = 'b6c7d8e9f0a1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'workflow_revisions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workflow_id', sa.Integer(), nullable=False),
        sa.Column('snapshot', sa.Text(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False, server_default='[]'),
        sa.Column('changed_by_id', sa.Integer(), nullable=True),
        sa.Column('via_token', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        # 워크플로를 지우면 이력도 함께. 없는 워크플로의 이력은 되짚을 대상이 없다.
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'],
                                ondelete='CASCADE'),
        # 사람을 지워도 이력은 남는다 — 누가 했는지만 잃는다.
        sa.ForeignKeyConstraint(['changed_by_id'], ['users.id'],
                                ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_workflow_revisions_workflow_id'),
                    'workflow_revisions', ['workflow_id'])
    _seed_baseline()


def _seed_baseline():
    """이미 있는 워크플로마다 **출발점** 한 줄을 남긴다.

    안 하면 첫 이력이 거짓말을 한다. 이력이 비어 있는 상태에서 누가 값 하나를
    고치면, 비교 대상이 없어 배선 전체가 「방금 추가됨」 으로 적히고 **그 사람이
    다 만든 것**처럼 보인다. 실제로는 숫자 하나를 바꿨을 뿐이다.

    출발점에는 사람을 적지 않는다(`changed_by_id` 가 비어 있다). 이 줄은 누가
    한 일이 아니라 「여기서부터 기록한다」 는 표시이기 때문이다.

    이름표(`labels`)는 비워 둔다. 다음 변경을 견줄 때는 **새 쪽**의 이름표를
    쓰므로, 값이 바뀐 줄은 그때 제대로 이름을 얻는다.
    """
    import json

    conn = op.get_bind()
    workflows = conn.execute(sa.text(
        'SELECT id, iter_tolerance, iter_max, iter_relaxation FROM workflows'
    )).fetchall()

    for wf in workflows:
        nodes = conn.execute(sa.text("""
            SELECT n.id, n.alias, n.card_id, c.name AS card_name,
                   n.sub_workflow_id, s.name AS sub_name, n.inputs
              FROM workflow_nodes n
              LEFT JOIN cards c ON c.id = n.card_id
              LEFT JOIN workflows s ON s.id = n.sub_workflow_id
             WHERE n.workflow_id = :wf ORDER BY n.id
        """), {'wf': wf.id}).fetchall()
        links = conn.execute(sa.text("""
            SELECT id, from_node_id, from_inner_node_id, from_variable_id,
                   from_label, to_node_id, to_inner_node_id, to_variable_id,
                   to_label
              FROM workflow_links WHERE workflow_id = :wf ORDER BY id
        """), {'wf': wf.id}).fetchall()

        if not nodes and not links:
            # 빈 워크플로는 출발점을 적을 것이 없다. 첫 수정 때 만들어진다.
            continue

        def _inputs(raw):
            try:
                value = json.loads(raw or '{}')
                return value if isinstance(value, dict) else {}
            except ValueError:
                return {}

        snapshot = {
            'iteration': {
                'tolerance': wf.iter_tolerance,
                'max': wf.iter_max,
                'relaxation': wf.iter_relaxation,
            },
            'nodes': [{
                'id': n.id, 'alias': n.alias or '',
                'card_id': n.card_id, 'card_name': n.card_name,
                'sub_workflow_id': n.sub_workflow_id,
                'sub_workflow_name': n.sub_name,
                'inputs': _inputs(n.inputs), 'labels': {},
            } for n in nodes],
            'links': [{
                'id': l.id,
                'from_node_id': l.from_node_id,
                'from_inner_node_id': l.from_inner_node_id,
                'from_variable_id': l.from_variable_id,
                'from_label': l.from_label,
                'to_node_id': l.to_node_id,
                'to_inner_node_id': l.to_inner_node_id,
                'to_variable_id': l.to_variable_id,
                'to_label': l.to_label,
            } for l in links],
        }
        summary = [{
            'kind': 'baseline',
            'text': (f'여기서부터 변경을 기록합니다 — 자리 {len(nodes)}개, '
                     f'연결 {len(links)}개로 시작합니다.'),
        }]

        conn.execute(sa.text("""
            INSERT INTO workflow_revisions
                   (workflow_id, snapshot, summary, changed_by_id, via_token,
                    created_at, updated_at)
            VALUES (:wf, :snapshot, :summary, NULL, false, NOW(), NOW())
        """), {
            'wf': wf.id,
            'snapshot': json.dumps(snapshot, ensure_ascii=False, sort_keys=True),
            'summary': json.dumps(summary, ensure_ascii=False),
        })


def downgrade():
    op.drop_index(op.f('ix_workflow_revisions_workflow_id'),
                  table_name='workflow_revisions')
    op.drop_table('workflow_revisions')
