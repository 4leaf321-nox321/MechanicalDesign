"""도해 — 앱이 그리는 형상 그림.

**그림 파일이 아니라 종류와 배선만 저장한다.** 파일로 두면 값이 바뀌어도 그림이
안 바뀌고, 이 플랫폼을 쓰는 이유가 변수를 움직여 보는 것이니 첫 변경에서 낡는다.

여기서 지키는 것:

    변수는 id 로 묶는다        기호로 묶으면 기호를 바꾸는 순간 그림이 조용히 빈다
    남의 카드 변수는 못 묶는다  안 보이는 값이 그림에 새어 나온다
    서버는 종류를 안 가린다     도해가 늘 때마다 서버를 고쳐야 하면 배포가 걸린다
"""

import json

import pytest

from app.extensions import db
from app.modules.cards.models import Figure, WidgetPlacement
from tests.test_records import _card, _login, _user, client   # noqa: F401


@pytest.fixture
def card(app, client):
    uid = _user(app)
    head = _login(client)
    card_id, ids = _card(app, uid)
    return {'head': head, 'id': card_id, 'vars': ids, 'uid': uid}


def _make(client, head, card_id, **body):
    return client.post(f'/api/cards/{card_id}/figures', headers=head,
                       json={'kind': 'sunk_key', **body})


def test_a_figure_stores_the_kind_and_the_wiring(app, client, card):
    head, ids = card['head'], card['vars']
    r = _make(client, head, card['id'],
              mapping={'d': ids['F'], 'b': ids['sig']}, caption='묻힘키')
    assert r.status_code == 201, r.get_json()
    body = r.get_json()
    assert body['kind'] == 'sunk_key'
    assert body['mapping'] == {'d': ids['F'], 'b': ids['sig']}
    assert body['caption'] == '묻힘키'


def test_the_wiring_points_at_variable_ids_not_symbols(app, client, card):
    """기호로 묶으면 기호를 바꾸는 순간 그림이 조용히 빈다."""
    head, ids = card['head'], card['vars']
    _make(client, head, card['id'], mapping={'d': ids['F']})

    with app.app_context():
        row = Figure.query.first()
        assert row.mapped()['d'] == ids['F']
        assert isinstance(row.mapped()['d'], int)


def test_you_cannot_wire_another_cards_variable(app, client, card):
    """안 보이는 카드의 값이 그림을 타고 새어 나가면 안 된다."""
    other_id, other_ids = _card(app, card['uid'], name='남의 카드')
    r = _make(client, card['head'], card['id'], mapping={'d': other_ids['F']})
    assert r.status_code == 400
    assert '이 카드의 변수가 아닌' in r.get_json()['error']


def test_an_empty_slot_is_left_out_not_stored_as_null(app, client, card):
    """빈 칸을 NULL 로 저장하면 「묶였는데 값이 없는」 상태가 생긴다."""
    head, ids = card['head'], card['vars']
    r = _make(client, head, card['id'], mapping={'d': ids['F'], 'b': None, 'L': ''})
    assert r.get_json()['mapping'] == {'d': ids['F']}


def test_the_server_does_not_police_the_kind(app, client, card):
    """도해가 늘 때마다 서버를 고쳐야 하면 그림 하나 추가에 배포가 걸린다.

    모르는 종류는 화면이 「그릴 줄 모르는 도해」 로 말한다.
    """
    r = _make(client, card['head'], card['id'], kind='아직_없는_도해')
    assert r.status_code == 201


def test_a_kind_is_required(app, client, card):
    r = client.post(f"/api/cards/{card['id']}/figures", headers=card['head'],
                    json={'kind': '  '})
    assert r.status_code == 400


def test_rewiring_replaces_the_whole_mapping(app, client, card):
    head, ids = card['head'], card['vars']
    made = _make(client, head, card['id'], mapping={'d': ids['F'], 'b': ids['sig']}).get_json()

    r = client.put(f"/api/cards/{card['id']}/figures/{made['id']}", headers=head,
                   json={'mapping': {'d': ids['sig']}})
    assert r.status_code == 200
    # 부분 갱신이면 「지운 것」 을 따로 알려 줘야 한다. 통째로 받는 편이 어긋날 자리가 없다.
    assert r.get_json()['mapping'] == {'d': ids['sig']}


def test_a_figure_can_be_placed_in_a_container(app, client, card):
    head = card['head']
    made = _make(client, head, card['id'], mapping={'d': card['vars']['F']}).get_json()
    box = client.post(f"/api/cards/{card['id']}/containers", headers=head,
                      json={'name': '형상'}).get_json()

    r = client.put(f"/api/cards/{card['id']}/widgets/layout", headers=head, json={
        'containers': [{'container_id': box['id'],
                        'widgets': [{'kind': 'figure', 'id': made['id']}]}],
    })
    assert r.status_code == 200, r.get_json()

    rows = client.get(f"/api/cards/{card['id']}/figures", headers=head).get_json()
    assert rows[0]['placements'][0]['container_id'] == box['id']


def test_a_placement_still_holds_exactly_one_widget(app, client, card):
    """셋 중 둘이 채워지면 어느 위젯이 보일지 알 수 없다. DB 가 막아야 한다."""
    head = card['head']
    made = _make(client, head, card['id']).get_json()
    box = client.post(f"/api/cards/{card['id']}/containers", headers=head,
                      json={'name': '형상'}).get_json()

    with app.app_context():
        db.session.add(WidgetPlacement(card_id=card['id'], container_id=box['id'],
                                       variable_id=card['vars']['F'],
                                       figure_id=made['id'], sort_order=0))
        with pytest.raises(Exception):
            db.session.commit()
        db.session.rollback()


def test_deleting_the_figure_takes_its_placement(app, client, card):
    head = card['head']
    made = _make(client, head, card['id']).get_json()
    box = client.post(f"/api/cards/{card['id']}/containers", headers=head,
                      json={'name': '형상'}).get_json()
    client.put(f"/api/cards/{card['id']}/widgets/layout", headers=head, json={
        'containers': [{'container_id': box['id'],
                        'widgets': [{'kind': 'figure', 'id': made['id']}]}],
    })

    assert client.delete(f"/api/cards/{card['id']}/figures/{made['id']}",
                         headers=head).status_code == 200
    with app.app_context():
        assert WidgetPlacement.query.filter_by(figure_id=made['id']).count() == 0


def test_a_broken_mapping_does_not_take_the_card_down(app, client, card):
    """한 도해의 배선이 깨졌다고 카드 전체가 500 이 되어서는 안 된다."""
    head = card['head']
    made = _make(client, head, card['id']).get_json()
    with app.app_context():
        db.session.get(Figure, made['id']).mapping = '{깨진 JSON'
        db.session.commit()

    r = client.get(f"/api/cards/{card['id']}/figures", headers=head)
    assert r.status_code == 200
    assert r.get_json()[0]['mapping'] == {}
