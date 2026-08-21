"""테이블 변수의 **표 참조**.

미리 만들어 둔 표(variable_templates)를 여러 변수가 함께 쓴다. 원본을 한 번
고치면 그 표를 참조하는 변수가 모두 따라 바뀐다.

**표의 두 부분은 성격이 다르다.**

    데이터(열 이름·행)        재료 물성표처럼 여럿이 공유할 값     → 원본이 갖는다
    조회 방법(조회 키·결과 열)  변수마다 다르다                    → 변수가 갖는다

같은 재료표를 참조하면서 어떤 변수는 항복강도를, 어떤 변수는 인장강도를 뽑아
쓰는 것이 실제 사용 방식이다. 그래서 데이터만 공유한다.

**열을 번호가 아니라 이름으로 가리킨다.**

편집기와 평가기는 열을 번호(column_index)로 다룬다. 표가 변수 안에 통째로
들어 있을 때는 그래도 됐다 — 열을 지우면 그 변수의 번호도 같이 손보면 되니까.
참조가 생기면 얘기가 달라진다. 원본에서 열 하나를 지우면 뒤 열의 번호가 앞으로
밀리고, 그 표를 쓰는 **모든 변수가 조용히 엉뚱한 열을 읽게 된다.** 오류도 나지
않는다.

그래서 저장은 이름으로 하고, 내보낼 때 지금 열 구성에 맞춰 번호로 바꿔 준다.
이름이 사라졌으면 그 사실을 `source_error` 로 알린다 — 조용히 틀린 값을 주느니
계산이 멈추는 편이 낫다.

저장 모양 (참조)          {"source_template_id": 3,
                          "result_column": "항복강도",
                          "keys": [{"column": "재료명", "expression": "mat",
                                    "match_mode": "exact"}]}

내보내는 모양 (해석 후)    위에 columns·rows·result_column_index·
                          keys[].column_index 가 채워진 것. 평가기가 이미 아는
                          모양이라 프론트는 손댈 필요가 없다.
"""

import json


def is_reference(data):
    """참조 모양인가. 표를 통째로 들고 있으면 아니다."""
    return isinstance(data, dict) and data.get('source_template_id') is not None


def _column_index(columns, name):
    try:
        return columns.index(name)
    except (ValueError, AttributeError):
        return None


def resolve(raw, lookup_template):
    """저장된 table_data(JSON 문자열) → 평가기가 아는 모양(dict).

    `lookup_template(template_id)` 은 VariableTemplate 이나 None 을 준다.
    참조가 아니면 그대로 돌려준다. 깨진 JSON 도 건드리지 않는다.
    """
    if not raw:
        return raw
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return raw
    if not is_reference(data):
        return raw

    template = lookup_template(data['source_template_id'])
    if template is None or template.var_type != 'table':
        data['source_error'] = '참조하는 표를 찾을 수 없습니다. 원본이 삭제된 것 같습니다.'
        data.setdefault('columns', [])
        data.setdefault('rows', [])
        data['result_column_index'] = None
        data['keys'] = []
        return json.dumps(data)

    try:
        source = json.loads(template.data or '{}')
    except (ValueError, TypeError):
        source = {}

    columns = source.get('columns') or []
    data['source_name'] = template.name
    data['columns'] = columns
    data['rows'] = source.get('rows') or []

    missing = []
    mode = data.get('lookup_mode') or 'row'

    if mode == 'cell':
        # 교차 조회는 결과 칸을 따로 고르지 않는다. 행 머리글이 든 열만 이름으로
        # 가리키고, 나머지 열의 머리글이 다른 한 축이 된다.
        header_index = _column_index(columns, data.get('row_header_column'))
        if header_index is None:
            missing.append(data.get('row_header_column'))
            header_index = 0
        data['row_header_index'] = header_index

    elif mode == 'column':
        # 누운 표. 항목 이름이 든 열만 이름으로 가리키고, 조회 행·결과 행은
        # 그 열에 적힌 **값**(항목 이름)으로 가리킨다 — 행에는 이름이 없으므로
        # 행 번호로 저장하면 원본에 행이 하나만 늘어도 어긋난다.
        label_index = _column_index(columns, data.get('label_column'))
        if label_index is None:
            missing.append(data.get('label_column'))
            label_index = 0
        data['label_column_index'] = label_index

    else:
        result_name = data.get('result_column')
        result_index = _column_index(columns, result_name)
        if result_index is None:
            missing.append(result_name)
        data['result_column_index'] = result_index

        resolved_keys = []
        for key in data.get('keys') or []:
            if not isinstance(key, dict):
                continue
            index = _column_index(columns, key.get('column'))
            if index is None:
                missing.append(key.get('column'))
                continue
            resolved_keys.append({
                'column_index': index,
                'column': key.get('column'),
                'expression': key.get('expression') or '',
                'match_mode': key.get('match_mode') or 'exact',
            })
        data['keys'] = resolved_keys

    if missing:
        names = ', '.join(str(m) for m in missing if m)
        data['source_error'] = (
            f'참조하는 표에 없는 열입니다: {names}. '
            '원본에서 열 이름이 바뀌었거나 삭제되었습니다.'
        )
    return json.dumps(data)


def to_storage(raw):
    """편집기가 보낸 모양 → 저장할 모양.

    참조면 데이터(열·행)를 떼어 낸다. 떼지 않으면 원본을 고쳐도 변수 안에 남은
    낡은 사본이 계속 쓰여서, 참조를 건 의미가 없어진다.
    """
    if not raw:
        return raw
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return raw
    if not is_reference(data):
        return raw

    columns = data.get('columns') or []
    mode = data.get('lookup_mode') or 'row'

    def column_name(explicit, index_key):
        # 이름이 실려 있으면 그것을 믿는다. 없으면 지금 열 구성에서 이름을 찾는다.
        if explicit:
            return explicit
        index = data.get(index_key)
        if isinstance(index, int) and 0 <= index < len(columns):
            return columns[index]
        return None

    stored = {
        'source_template_id': data['source_template_id'],
        'lookup_mode': mode,
    }

    if mode == 'cell':
        stored['row_header_column'] = column_name(data.get('row_header_column'), 'row_header_index')
        stored['row_lookup'] = data.get('row_lookup') or {}
        stored['column_lookup'] = data.get('column_lookup') or {}
        return json.dumps(stored)

    if mode == 'column':
        stored['label_column'] = column_name(data.get('label_column'), 'label_column_index')
        # 조회 행·결과 행은 항목 이름으로만 가리킨다. 편집기도 이름으로 고른다.
        stored['result_row_label'] = data.get('result_row_label')
        stored['keys'] = [
            {
                'row_label': k.get('row_label'),
                'expression': k.get('expression') or '',
                'match_mode': k.get('match_mode') or 'exact',
            }
            for k in (data.get('keys') or []) if isinstance(k, dict)
        ]
        return json.dumps(stored)

    keys = []
    for key in data.get('keys') or []:
        if not isinstance(key, dict):
            continue
        name = key.get('column')
        if not name:
            index = key.get('column_index')
            if isinstance(index, int) and 0 <= index < len(columns):
                name = columns[index]
        if not name:
            continue
        keys.append({
            'column': name,
            'expression': key.get('expression') or '',
            'match_mode': key.get('match_mode') or 'exact',
        })

    stored['result_column'] = column_name(data.get('result_column'), 'result_column_index')
    stored['keys'] = keys
    return json.dumps(stored)


def referenced_template_id(raw):
    """이 정의가 참조하는 표의 id. 참조가 아니면 None."""
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return None
    return data.get('source_template_id') if is_reference(data) else None
