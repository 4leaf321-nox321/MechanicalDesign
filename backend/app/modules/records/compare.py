"""기록 둘을 견준다 — 「왜 이번엔 답이 다르지」 에 답한다.

지금은 두 화면을 번갈아 보며 눈으로 찾는 일이다. 값이 스무 개면 그건 하지 않게
되고, 안 하면 **달라진 이유를 모르는 채로 넘어간다.**

## 세 가지를 견준다

    입력   무엇을 다르게 넣었나
    결과   그래서 무엇이 얼마나 달라졌나
    정의   계산 자체가 그새 바뀌었나

**셋째가 이 기능의 핵심이다.** 카드는 살아 있는 참조라, 어제 계산하고 오늘 다시
계산하는 사이에 누군가 수식을 고쳤을 수 있다. 그러면 **입력이 똑같은데 답이
다르다.** 그것이 이 시스템에서 가장 무서운 종류의 차이인데, 지금은 화면에서
알아낼 방법이 없다. 기록이 `definition_snapshot` 을 들고 있으니 답할 수 있다.

## 서버에서 견주는 이유

정의 비교 규칙이 카드 개정 이력에 이미 있다(`cards.revisions.diff`). 화면에서
다시 구현하면 두 벌이 되고, 두 벌은 반드시 어긋난다 — 그때 이력 화면과 비교
화면이 같은 변경을 다르게 말하게 된다.
"""

from app.modules.cards import revisions as card_revisions
from app.modules.workflows import revisions as workflow_revisions

#: 부동소수 찌꺼기를 차이로 부르지 않는다. 1e-12 만큼 다른 것은 같은 값이다.
REL_EPSILON = 1e-12


def _as_number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except (TypeError, ValueError):
            return None
    return None


def _same(a, b):
    """두 값이 같은가. 숫자면 숫자로, 아니면 있는 그대로."""
    x, y = _as_number(a), _as_number(b)
    if x is None or y is None:
        return a == b
    if x == y:
        return True
    scale = max(abs(x), abs(y))
    return abs(x - y) <= REL_EPSILON * scale


def _movement(a, b):
    """얼마나 움직였나 — 차이와 비율.

    **0 에서 출발하면 비율을 말하지 않는다.** 무한대를 적어 두면 화면이 그것을
    숫자로 읽고, 정렬하면 맨 위에 온다. 모르는 것은 모른다고 두는 편이 낫다.
    """
    x, y = _as_number(a), _as_number(b)
    if x is None or y is None:
        return {}
    out = {'delta': y - x}
    if x != 0:
        out['ratio'] = (y - x) / abs(x)
    return out


def _label_map(snapshot):
    """변수 id → 사람이 읽을 이름. 카드 기록의 스냅샷에서 뽑는다."""
    out = {}
    for variable in snapshot or []:
        symbol = (variable.get('symbol') or '').strip()
        name = variable.get('name') or ''
        out[str(variable.get('id'))] = f'{name} ({symbol})' if symbol else name
    return out


def _workflow_labels(snapshot):
    """워크플로 기록: `노드id` → (자리 이름, {변수id: 이름})."""
    cards = (snapshot or {}).get('cards') or {}
    nodes = {}

    def walk(wiring):
        for node in (wiring or {}).get('nodes') or []:
            inner = node.get('sub_workflow')
            if inner:
                walk(inner)
                # 중첩 자리의 칸은 `안쪽노드:변수id` 로 적힌다. 안쪽 이름표를
                # 모아 두면 바깥에서 그대로 꺼내 쓸 수 있다.
                labels = {}
                for inner_node in inner.get('nodes') or []:
                    got = nodes.get(str(inner_node.get('id')))
                    if not got:
                        continue
                    for key, text in got[1].items():
                        labels[f"{inner_node.get('id')}:{key}"] = f'{got[0]} · {text}'
                nodes[str(node.get('id'))] = (node.get('alias') or '', labels)
            else:
                nodes[str(node.get('id'))] = (
                    node.get('alias') or '',
                    _label_map(cards.get(str(node.get('card_id')))),
                )

    walk(snapshot)
    return nodes


def _rows(a_values, b_values, labels, cell=False):
    """한 묶음의 값들을 나란히. 한쪽에만 있는 것도 빠뜨리지 않는다."""
    out = []
    for key in sorted(set(a_values or {}) | set(b_values or {}), key=str):
        a, b = (a_values or {}).get(key), (b_values or {}).get(key)
        if cell:
            # 결과는 `{value, error}` 로 온다. 오류였던 칸도 말해 주어야 한다.
            a_err = (a or {}).get('error') if isinstance(a, dict) else None
            b_err = (b or {}).get('error') if isinstance(b, dict) else None
            a = (a or {}).get('value') if isinstance(a, dict) else a
            b = (b or {}).get('value') if isinstance(b, dict) else b
        else:
            a_err = b_err = None

        row = {
            'key': str(key),
            'label': labels.get(str(key), str(key)),
            'a': a, 'b': b,
            'changed': not _same(a, b) or a_err != b_err,
        }
        if a_err or b_err:
            row['a_error'], row['b_error'] = a_err, b_err
        if row['changed']:
            row.update(_movement(a, b))
        out.append(row)
    return out


def _card_diff(a, b):
    inputs = _rows(a['inputs'], b['inputs'], _label_map(a['definition_snapshot']))
    results = _rows(a['results'], b['results'],
                    _label_map(b['definition_snapshot']), cell=True)
    definition = card_revisions.diff(a['definition_snapshot'],
                                     b['definition_snapshot'])
    return inputs, results, definition


def _workflow_diff(a, b):
    """워크플로 기록은 값이 자리마다 나뉘어 있다 — `{노드id: {칸: 값}}`."""
    labels = _workflow_labels(b['definition_snapshot'])
    labels_a = _workflow_labels(a['definition_snapshot'])

    inputs, results = [], []
    node_ids = sorted(set(a['inputs'] or {}) | set(b['inputs'] or {})
                      | set(a['results'] or {}) | set(b['results'] or {}), key=str)
    for node_id in node_ids:
        # 자리 이름은 **새 쪽을 먼저** 본다. 이름이 바뀌었으면 지금 이름으로
        # 말해 주는 편이 찾기 쉽다.
        alias, cells = labels.get(str(node_id)) or labels_a.get(str(node_id)) or ('', {})
        name = alias or f'노드 {node_id}'
        for row in _rows((a['inputs'] or {}).get(node_id),
                         (b['inputs'] or {}).get(node_id), cells):
            inputs.append({**row, 'node_id': node_id, 'node': name})
        for row in _rows((a['results'] or {}).get(node_id),
                         (b['results'] or {}).get(node_id), cells, cell=True):
            results.append({**row, 'node_id': node_id, 'node': name})

    definition = workflow_revisions.diff(
        _as_revision(a['definition_snapshot']),
        _as_revision(b['definition_snapshot']))
    return inputs, results, definition


def _as_revision(snapshot):
    """기록의 워크플로 스냅샷을 개정 이력이 견주는 모양으로.

    두 스냅샷의 생김새가 조금 다르다 — 기록은 카드 정의까지 담고, 이력은 값과
    배선만 담는다. **비교 규칙은 하나만 둔다.** 여기서 모양만 맞춰 주면 이력과
    비교가 같은 변경을 같은 말로 설명하게 된다.
    """
    snapshot = snapshot or {}
    cards = snapshot.get('cards') or {}

    def labels_for(node):
        inner = node.get('sub_workflow')
        if inner:
            out = {}
            for inner_node in inner.get('nodes') or []:
                for key, text in labels_for(inner_node).items():
                    out[key if ':' in key else f"{inner_node.get('id')}:{key}"] = text
            return out
        return _label_map(cards.get(str(node.get('card_id'))))

    return {
        # 기록은 반복 기준을 `run_meta` 에 따로 들고 있어 여기 없다. 없는 것을
        # 빈 값으로 두면 「기준이 바뀌었다」 는 거짓 변경이 생긴다.
        'iteration': {},
        'nodes': [{
            'id': n.get('id'),
            'alias': n.get('alias') or '',
            'card_id': n.get('card_id'),
            'card_name': n.get('card_name'),
            'sub_workflow_id': n.get('sub_workflow_id'),
            'sub_workflow_name': n.get('sub_workflow_name'),
            'inputs': n.get('inputs') or {},
            'labels': labels_for(n),
        } for n in snapshot.get('nodes') or []],
        'links': snapshot.get('links') or [],
    }


def compare(a, b):
    """두 기록의 차이. `a`, `b` 는 `to_dict(full=True)` 결과다.

    **서로 다른 것을 계산한 기록도 견줄 수 있게 둔다.** 막으면 「비슷한 두
    검토가 왜 다른가」 를 못 묻게 된다. 대신 같은 것을 잰 것이 아니라는 사실을
    응답에 담아, 화면이 먼저 말할 수 있게 한다.
    """
    same_source = (a.get('kind') == b.get('kind')
                   and a.get('card_id') == b.get('card_id')
                   and a.get('workflow_id') == b.get('workflow_id'))

    if a.get('kind') == 'workflow' and b.get('kind') == 'workflow':
        inputs, results, definition = _workflow_diff(a, b)
    elif a.get('kind') != 'workflow' and b.get('kind') != 'workflow':
        inputs, results, definition = _card_diff(a, b)
    else:
        # 카드 기록과 워크플로 기록은 값이 놓인 모양부터 다르다. 억지로
        # 나란히 세우면 전부 「달라짐」 이 되어 아무 말도 못 한다.
        inputs, results, definition = [], [], []

    changed_inputs = [r for r in inputs if r['changed']]
    changed_results = [r for r in results if r['changed']]

    return {
        'same_source': same_source,
        'comparable': not (a.get('kind') != b.get('kind')),
        'inputs': inputs,
        'results': results,
        'definition': definition,
        'summary': {
            'inputs_changed': len(changed_inputs),
            'results_changed': len(changed_results),
            'definition_changed': len(definition),
            # **입력이 같은데 답이 다르다.** 정의가 그새 바뀌었다는 뜻이고,
            # 이것이 이 화면이 잡아내려는 바로 그 경우다.
            'unexplained': bool(changed_results and not changed_inputs),
        },
    }
