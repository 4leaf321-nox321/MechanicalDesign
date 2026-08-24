"""카드 복제 — 비슷한 계산을 처음부터 다시 만들지 않게.

'M10 볼트 검토' 로 'M12' 를 만드는 일이 이 시스템에서 가장 흔한 작업인데,
지금까지는 변수 스무 개를 손으로 다시 만들어야 했다. 변수·표·컨테이너는 각각
복사가 되면서 정작 카드는 안 됐다.

**무엇을 가져오고 무엇을 두고 오는가**가 이 파일의 전부다.

    가져온다   변수 정의 전부, 컨테이너와 그 배치, 이미지(파일까지), 색·설명
    두고 온다  게시(조직·전사), 변경 이력, 계산 기록, 게시 시각·게시자

두고 오는 것들의 공통점은 **"이 카드가 검토를 거쳤다" 는 흔적**이라는 점이다.
사본은 아직 아무도 보지 않았으므로 그 흔적을 물려받으면 안 된다. 물려받으면
복제본이 검토된 카드처럼 보이고, 그것이 이 시스템이 막으려는 바로 그 상태다.

그래서 사본은 언제나 **만든 사람의 개인 공간에 초안으로** 떨어진다.
"""

import os
import shutil
import uuid
from datetime import datetime

from app.extensions import db

from .models import Card, Container, Image, Variable, WidgetPlacement


def _free_name(base):
    """'볼트 강도' → '볼트 강도 사본', 이미 있으면 '사본 2'.

    지운 카드까지 함께 본다. 휴지통에 있는 이름을 다시 쓰면, 그것을 되살리는
    순간 같은 이름이 둘이 된다.
    """
    taken = {n for (n,) in db.session.query(Card.name).all()}
    candidate = f'{base} 사본'
    n = 2
    while candidate in taken:
        candidate = f'{base} 사본 {n}'
        n += 1
    return candidate


def _free_route(make_route, name):
    """라우트는 **유일해야 한다**(DB 제약). 이름에서 만들고 겹치면 번호를 붙인다.

    이름과 따로 계산한다. 이름이 달라도 라우트는 같아질 수 있기 때문이다 —
    `_make_route` 가 기호를 걷어내므로 '볼트-2' 와 '볼트 2' 가 한곳으로 모인다.
    """
    base = make_route(name)
    taken = {r for (r,) in db.session.query(Card.route).all()}
    candidate = base
    n = 2
    while candidate in taken:
        candidate = f'{base}-{n}'
        n += 1
    return candidate


def _copy_image_file(upload_root, src_card_id, dst_card_id, stored_name):
    """이미지 파일을 새 카드 폴더로 복사하고 새 저장명을 돌려준다.

    **파일을 같이 복사한다.** 저장명만 물려주면 두 카드가 한 파일을 가리키게
    되는데, 원본 카드를 완전 삭제하는 순간 사본의 그림이 깨진다. 그림이 빠진
    도면은 계산서로 쓸 수 없다.

    복사에 실패해도 카드 복제 전체를 되돌리지 않는다 — 그림 한 장 때문에
    변수 스무 개를 다시 만들게 하는 것이 더 나쁘다. 그 이미지만 빠진다.
    """
    src = os.path.join(upload_root, str(src_card_id), stored_name)
    if not os.path.exists(src):
        return None

    ext = os.path.splitext(stored_name)[1]
    new_name = f'{uuid.uuid4().hex}{ext}'
    dst_dir = os.path.join(upload_root, str(dst_card_id))
    try:
        os.makedirs(dst_dir, exist_ok=True)
        shutil.copy2(src, os.path.join(dst_dir, new_name))
    except OSError:
        return None
    return new_name


def duplicate_card(source, actor, home_org_slug, make_route, upload_root,
                   via_token=False):
    """카드를 통째로 복제한다. 사본은 만든 사람의 개인 공간에 초안으로 놓인다.

    변수의 **기호는 그대로 둔다.** 수식은 기호로 서로를 부르므로 여기서 기호를
    바꾸면 카드 안의 수식이 전부 깨진다. 카드가 다르면 기호가 겹쳐도 아무
    문제가 없다 — 계산은 카드 안에서만 돈다.
    """
    copy = Card(
        name=_free_name(source.name),
        description=source.description,
        route=_free_route(make_route, source.name),
        color=source.color,
        sort_order=(db.session.query(db.func.max(Card.sort_order)).scalar() or 0) + 1,
        created_by_id=actor.id,
        home_org_slug=home_org_slug,
        # **언제나 초안이다.** 원본이 게시돼 있었더라도 사본은 아무도 안 봤다.
        status='draft',
        origin='mcp' if via_token else 'human',
        ai_touched_at=datetime.utcnow() if via_token else None,
    )
    db.session.add(copy)
    db.session.flush()          # copy.id 가 있어야 하위 자원을 붙일 수 있다

    # --- 컨테이너 --------------------------------------------------------------
    container_map = {}
    for c in Container.query.filter_by(card_id=source.id).order_by(Container.sort_order):
        new_c = Container(
            card_id=copy.id, name=c.name, container_type=c.container_type,
            layout_x=c.layout_x, layout_y=c.layout_y,
            layout_w=c.layout_w, layout_h=c.layout_h,
            column_count=c.column_count, sort_order=c.sort_order,
        )
        db.session.add(new_c)
        db.session.flush()
        container_map[c.id] = new_c.id

    # --- 변수 ------------------------------------------------------------------
    variable_map = {}
    for v in Variable.query.filter_by(card_id=source.id).order_by(Variable.sort_order):
        new_v = Variable(
            card_id=copy.id, name=v.name, category=v.category, var_type=v.var_type,
            symbol=v.symbol, formula=v.formula,
            # 표 정의는 **저장된 그대로** 옮긴다. 표 참조라면 참조인 채로 따라와야
            # 원본 표가 바뀔 때 사본도 함께 바뀐다. 여기서 풀어 버리면 사본만
            # 옛 값에 굳는다.
            table_data=v.table_data, options_data=v.options_data,
            conditional_data=v.conditional_data, interp_data=v.interp_data,
            unit=v.unit, min_value=v.min_value, max_value=v.max_value,
            sort_order=v.sort_order,
        )
        db.session.add(new_v)
        db.session.flush()
        variable_map[v.id] = new_v.id

    # --- 이미지 ----------------------------------------------------------------
    image_map = {}
    for img in Image.query.filter_by(card_id=source.id).order_by(Image.sort_order):
        stored = _copy_image_file(upload_root, source.id, copy.id, img.stored_name)
        if stored is None:
            continue        # 원본 파일이 없거나 복사 실패 — 이 이미지만 건너뛴다
        new_img = Image(
            card_id=copy.id, filename=img.filename, stored_name=stored,
            mime_type=img.mime_type, sort_order=img.sort_order,
        )
        db.session.add(new_img)
        db.session.flush()
        image_map[img.id] = new_img.id

    # --- 배치 ------------------------------------------------------------------
    # 배치는 id 로 가리키므로 **새 id 로 갈아 끼워야 한다.** 그냥 옮기면 사본의
    # 배치가 원본의 변수를 가리켜, 원본을 고칠 때 사본 화면이 함께 바뀐다.
    for p in WidgetPlacement.query.filter_by(card_id=source.id).order_by(
            WidgetPlacement.sort_order):
        new_container = container_map.get(p.container_id)
        if new_container is None:
            continue
        new_variable = variable_map.get(p.variable_id) if p.variable_id else None
        new_image = image_map.get(p.image_id) if p.image_id else None
        if new_variable is None and new_image is None:
            # 파일이 없어 건너뛴 이미지의 배치. 자리만 남기면 빈 칸이 생긴다.
            continue
        db.session.add(WidgetPlacement(
            card_id=copy.id, container_id=new_container,
            variable_id=new_variable, image_id=new_image,
            sort_order=p.sort_order,
        ))

    db.session.commit()
    return copy
