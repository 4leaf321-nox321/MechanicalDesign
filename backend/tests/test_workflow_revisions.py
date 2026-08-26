"""워크플로 개정 이력.

**답이 어제와 다른데 아무도 손댄 기억이 없을 때** 되짚을 자리를 만드는 기능이다.
그래서 여기서 지키는 것은 「빠짐없이 남는가」 와 「읽을 수 있게 남는가」 둘이다.

카드 이력과 **같은 규칙**으로 움직여야 한다는 것도 함께 지킨다. 두 이력이 서로
다르게 굴면, 화면에서 나란히 놓인 두 목록이 서로 다른 것을 뜻하게 된다.
"""

import json

import pytest

from app.extensions import db
from app.modules.workflows.models import WorkflowRevision
from tests.test_workflows import (          # noqa: F401  (픽스처를 가져온다)
    _card, _link, _login, _node, _user, chain, client,
)


def _revs(client, head, wf_id):
    r = client.get(f'/api/workflows/{wf_id}/revisions', headers=head)
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def _texts(revision):
    return [c['text'] for c in revision['changes']]


def _unstick(app, wf_id):
    """이력을 묶는 창을 벗어난 것처럼 만든다.

    같은 사람이 5분 안에 이어 고치면 한 줄로 묶이는데(그게 맞다 — 안 묶으면
    이력을 사람이 못 읽는다), 시험에서는 줄이 나뉘는 것도 봐야 한다.
    """
    from datetime import datetime, timedelta

    with app.app_context():
        row = (WorkflowRevision.query.filter_by(workflow_id=wf_id)
               .order_by(WorkflowRevision.id.desc()).first())
        if row is not None:
            old = datetime.utcnow() - timedelta(hours=1)
            row.created_at = row.updated_at = old
            db.session.commit()


def test_wiring_a_workflow_leaves_a_trail(app, client, chain):
    head, wf = chain['head'], chain['wf']
    n1 = _node(client, head, wf['id'], chain['load_id'])
    n2 = _node(client, head, wf['id'], chain['stress_id'])
    _link(client, head, wf['id'], n1, chain['load_vars']['F'],
          n2, chain['stress_vars']['Fin'])

    rows = _revs(client, head, wf['id'])
    assert rows, '이력이 하나도 안 남았습니다'
    # 이어서 한 일이라 한 줄로 묶인다. 그 한 줄이 전부를 말해야 한다.
    text = ' '.join(_texts(rows[0]))
    assert '자리 추가' in text
    assert '연결 추가' in text
    assert rows[0]['changed_by_name']


def test_a_value_change_says_which_box_and_what_it_was(app, client, chain):
    """「누가 두께를 32로 바꿨나」 가 여기서 답해져야 한다."""
    head, wf = chain['head'], chain['wf']
    node = _node(client, head, wf['id'], chain['stress_id'], alias='응력검토')
    area = chain['stress_vars']['A']
    client.put(f"/api/workflows/{wf['id']}/nodes/{node['id']}",
               json={'inputs': {str(area): 25}}, headers=head)
    _unstick(app, wf['id'])
    client.put(f"/api/workflows/{wf['id']}/nodes/{node['id']}",
               json={'inputs': {str(area): 30}}, headers=head)

    text = ' '.join(_texts(_revs(client, head, wf['id'])[0]))
    assert '응력검토' in text
    # 이름표를 스냅샷에 베껴 두지 않으면 「12번 칸」 밖에 못 말한다.
    assert '단면적' in text
    assert '25' in text and '30' in text


def test_moving_a_node_leaves_no_trail(app, client, chain):
    """좌표는 계산을 바꾸지 않는다. 드래그가 이력을 묻어 버리면 안 된다."""
    head, wf = chain['head'], chain['wf']
    node = _node(client, head, wf['id'], chain['load_id'])
    _unstick(app, wf['id'])
    before = len(_revs(client, head, wf['id']))

    r = client.put(f"/api/workflows/{wf['id']}/nodes/{node['id']}",
                   json={'layout_x': 400, 'layout_y': 250}, headers=head)
    assert r.status_code == 200

    assert len(_revs(client, head, wf['id'])) == before


def test_grouping_leaves_no_trail(app, client, chain):
    """묶음도 그림일 뿐이다 — 계산에 아무 영향이 없다고 정해 두었다."""
    head, wf = chain['head'], chain['wf']
    node = _node(client, head, wf['id'], chain['load_id'])
    _unstick(app, wf['id'])
    before = len(_revs(client, head, wf['id']))

    r = client.post(f"/api/workflows/{wf['id']}/groups", headers=head,
                    json={'name': '앞단', 'node_ids': [node['id']]})
    assert r.status_code in (200, 201), r.get_json()

    assert len(_revs(client, head, wf['id'])) == before


def test_iteration_settings_land_in_the_same_list(app, client, chain):
    """반복 기준이 바뀌면 **같은 입력으로도 답이 달라진다.**

    값 변경과 나란히 놓여야 「왜 어제와 다르지」 가 한 목록에서 풀린다.
    """
    head, wf = chain['head'], chain['wf']
    _node(client, head, wf['id'], chain['load_id'])
    _unstick(app, wf['id'])

    r = client.put(f"/api/workflows/{wf['id']}", headers=head,
                   json={'iter_max': 500})
    assert r.status_code == 200, r.get_json()

    text = ' '.join(_texts(_revs(client, head, wf['id'])[0]))
    assert '반복 기준' in text and '500' in text


def test_edits_in_one_sitting_become_one_entry(app, client, chain):
    """순서도에서 값 하나 고칠 때마다 요청이 나간다. 그대로 쌓으면 못 읽는다."""
    head, wf = chain['head'], chain['wf']
    node = _node(client, head, wf['id'], chain['stress_id'])
    area = chain['stress_vars']['A']
    for value in (10, 20, 30):
        client.put(f"/api/workflows/{wf['id']}/nodes/{node['id']}",
                   json={'inputs': {str(area): value}}, headers=head)

    rows = _revs(client, head, wf['id'])
    assert len(rows) == 1
    # 묶였어도 **처음부터 지금까지**를 말해야 한다. 방금 묶인 것과 견주면
    # "바뀐 것 없음" 이 되어 이력이 내용을 잃는다.
    text = ' '.join(_texts(rows[0]))
    assert '자리 추가' in text
    assert '30' in text


def test_a_deleted_workflow_takes_its_history(app, client, chain):
    head, wf = chain['head'], chain['wf']
    _node(client, head, wf['id'], chain['load_id'])
    assert _revs(client, head, wf['id'])

    client.delete(f"/api/workflows/{wf['id']}", headers=head)
    client.delete(f"/api/workflows/{wf['id']}/permanent", headers=head)

    with app.app_context():
        assert WorkflowRevision.query.filter_by(workflow_id=wf['id']).count() == 0


def test_the_snapshot_is_the_whole_wiring(app, client, chain):
    """변경 로그가 아니라 그때의 모습 전부. 되짚을 때 이것만 열면 된다."""
    head, wf = chain['head'], chain['wf']
    n1 = _node(client, head, wf['id'], chain['load_id'])
    n2 = _node(client, head, wf['id'], chain['stress_id'])
    _link(client, head, wf['id'], n1, chain['load_vars']['F'],
          n2, chain['stress_vars']['Fin'])

    latest = _revs(client, head, wf['id'])[0]
    r = client.get(f"/api/workflows/{wf['id']}/revisions/{latest['id']}",
                   headers=head)
    assert r.status_code == 200
    snapshot = r.get_json()['snapshot']
    assert len(snapshot['nodes']) == 2
    assert len(snapshot['links']) == 1
    # 좌표는 안 담는다 — 담으면 드래그마다 스냅샷이 달라져 이력이 쌓인다.
    assert 'layout_x' not in snapshot['nodes'][0]


def test_the_list_does_not_carry_snapshots(app, client, chain):
    """이력이 스무 개면 응답이 배선 스무 벌이 된다."""
    head, wf = chain['head'], chain['wf']
    _node(client, head, wf['id'], chain['load_id'])
    rows = _revs(client, head, wf['id'])
    assert 'snapshot' not in rows[0]
    assert 'changes' in rows[0]


def test_a_failed_edit_leaves_no_trail(app, client, chain):
    """되지도 않은 일이 이력에 남으면, 이력이 거짓말을 하는 것이다."""
    head, wf = chain['head'], chain['wf']
    n1 = _node(client, head, wf['id'], chain['load_id'])
    n2 = _node(client, head, wf['id'], chain['stress_id'])
    _unstick(app, wf['id'])
    before = len(_revs(client, head, wf['id']))

    # 입력을 입력에 잇는 것은 막혀 있다.
    r = _link(client, head, wf['id'], n1, chain['load_vars']['m'],
              n2, chain['stress_vars']['Fin'])
    assert r.status_code == 400

    assert len(_revs(client, head, wf['id'])) == before


def test_history_is_not_offered_for_someone_elses_draft(app, client, chain):
    """초안은 남에게 안 보인다 — 이력도 마찬가지여야 한다."""
    head, wf = chain['head'], chain['wf']
    _node(client, head, wf['id'], chain['load_id'])

    _user(app, 'lee@x.com')
    other = _login(client, 'lee@x.com')
    r = client.get(f"/api/workflows/{wf['id']}/revisions", headers=other)
    assert r.status_code == 404
