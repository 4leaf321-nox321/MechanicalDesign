"""조직 트리를 만들고 옮기고 지우는 규칙.

라우트가 아니라 여기에 두는 이유: 개인 공간은 **가입할 때도** 만들어져야 하는데,
그 자리는 조직 라우트가 아니라 계정 모듈이다. 규칙이 라우트 안에 있으면 계정
모듈이 조직 라우트를 부르게 되고, 그때부터 두 모듈이 서로를 부른다.
"""

import re
import unicodedata

from app.extensions import db
from app.shared.errors import AppError

from .models import CardMount, Organization

#: 최상위 조직. 마이그레이션이 만들고, 기존 카드가 여기로 들어온다.
ROOT_SLUG = 'all'

#: 개인 공간의 slug 규칙. 사람 id 로 만들어 충돌하지 않는다.
PERSONAL_PREFIX = 'personal-'


def personal_slug(user_id):
    return f'{PERSONAL_PREFIX}{user_id}'


def slugify(name, taken=None):
    """이름에서 주소에 쓸 문자열을 만든다.

    한글 조직명이 대부분이라 **음차하지 않는다.** 'design-1' 같은 영문을 지어
    붙이면 그것이 무슨 조직인지 아무도 모르고, 사람이 정한 이름과 주소가 따로
    논다. 한글을 그대로 두면 주소창에서는 퍼센트 인코딩으로 보이지만, 화면과
    링크에서는 원래 글자로 돌아온다.

    빈 문자열이 되는 경우(기호만 있는 이름)만 대비해 `org` 로 떨어뜨린다.
    """
    text = unicodedata.normalize('NFC', (name or '').strip())
    text = re.sub(r'\s+', '-', text)
    text = re.sub(r'[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ_-]', '', text)
    text = text.strip('-') or 'org'
    text = text[:56]

    if taken is None:
        return text
    candidate = text
    n = 2
    while candidate in taken:
        candidate = f'{text}-{n}'
        n += 1
    return candidate


def ensure_personal_org(user, commit=False):
    """이 사람의 개인 공간을 보장한다. 있으면 그대로 돌려준다.

    **가입 시점에 만들지 않고 필요할 때 보장하는 쪽**을 함께 둔다. 조직 기능이
    붙기 전에 가입한 사람에게는 개인 공간이 없는데, 그 사람이 카드를 만들려는
    순간 "당신의 공간이 없습니다" 로 막히면 고칠 방법이 화면에 없다.
    """
    slug = personal_slug(user.id)
    org = db.session.get(Organization, slug)
    if org is not None:
        return org

    org = Organization(
        slug=slug,
        name=f'{user.display_name}',
        description='개인 공간',
        parent_slug=None,
        kind='personal',
        owner_user_id=user.id,
        color='#94a3b8',
    )
    db.session.add(org)
    if commit:
        db.session.commit()
    else:
        # 카드 생성이 이 뒤에 이어지므로 slug 가 FK 로 쓰일 수 있어야 한다.
        db.session.flush()
    return org


def org_tree(include_counts=True):
    """조직(kind='org')만으로 트리를 만든다. 개인 공간은 트리에 매달지 않는다.

    개인 공간은 조직도의 일부가 아니다. 트리에 섞으면 사람이 늘 때마다 조직도
    맨 아래가 사람 목록으로 길어지고, 정작 부서를 찾기가 어려워진다.
    """
    rows = (Organization.query
            .filter_by(kind='org')
            .order_by(Organization.sort_order, Organization.name)
            .all())

    counts = {}
    if include_counts:
        for slug, n in (db.session.query(CardMount.org_slug, db.func.count(CardMount.card_id))
                        .group_by(CardMount.org_slug).all()):
            counts[slug] = n

    nodes = {r.slug: {**r.to_dict(card_count=counts.get(r.slug, 0)), 'children': []}
             for r in rows}
    roots = []
    for r in rows:
        node = nodes[r.slug]
        parent = nodes.get(r.parent_slug) if r.parent_slug else None
        if parent is None:
            roots.append(node)
        else:
            parent['children'].append(node)
    return roots


def descendant_slugs(slug):
    """자신과 모든 하위 조직의 slug.

    **본부를 눌렀을 때 그 아래 팀 카드까지 보이게 하려는 것이다.** 팀에만
    게시된 카드를 본부에서 못 보면, 본부장은 팀을 하나씩 눌러 보게 된다.
    """
    rows = Organization.query.filter_by(kind='org').all()
    children = {}
    for r in rows:
        children.setdefault(r.parent_slug, []).append(r.slug)

    out, stack = set(), [slug]
    while stack:
        cur = stack.pop()
        if cur in out:
            continue
        out.add(cur)
        stack.extend(children.get(cur, []))
    return out


def assert_no_cycle(slug, new_parent_slug):
    """조직을 옮길 때 자기 자신 아래로 들어가지 않는지 본다.

    막지 않으면 그 가지가 트리에서 **통째로 사라진다** — 루트에서 내려가는 길이
    끊기므로 화면에 아예 안 나오고, DB 를 직접 보기 전에는 어디 갔는지 알 수
    없다. 오류도 나지 않는다.
    """
    if not new_parent_slug:
        return
    if new_parent_slug == slug:
        raise AppError('MD-ORG-0102', '자기 자신을 상위 조직으로 둘 수 없습니다.')
    if new_parent_slug in descendant_slugs(slug):
        raise AppError('MD-ORG-0103',
                       '하위 조직을 상위로 둘 수 없습니다 — 트리가 끊어집니다.')


def create_org(name, parent_slug=None, description='', color=None, sort_order=None):
    name = (name or '').strip()
    if not name:
        raise AppError('MD-ORG-0100', '조직 이름을 입력해 주세요.')

    if parent_slug:
        parent = db.session.get(Organization, parent_slug)
        if parent is None or parent.kind != 'org':
            raise AppError('MD-ORG-0101', f"상위 조직 '{parent_slug}' 을 찾을 수 없습니다.")

    taken = {s for (s,) in db.session.query(Organization.slug).all()}
    org = Organization(
        slug=slugify(name, taken),
        name=name,
        description=(description or '').strip(),
        parent_slug=parent_slug or None,
        kind='org',
        color=color or '#64748b',
        sort_order=sort_order if sort_order is not None else _next_sort_order(parent_slug),
    )
    db.session.add(org)
    db.session.commit()
    return org


def _next_sort_order(parent_slug):
    last = (db.session.query(db.func.max(Organization.sort_order))
            .filter(Organization.kind == 'org',
                    Organization.parent_slug.is_(None) if parent_slug is None
                    else Organization.parent_slug == parent_slug)
            .scalar())
    return (last or 0) + 1


def delete_org(slug):
    """조직을 지운다. **하위가 있거나 게시된 카드가 있으면 막는다.**

    지우게 두면 게시가 CASCADE 로 함께 사라진다. 카드 자체는 개인 공간에 남지만,
    "어제까지 팀 게시판에 있던 계산이 오늘 없다" 는 상태가 조용히 생긴다. 무엇을
    잃게 되는지 숫자로 말해 주고 사람이 결정하게 한다.
    """
    org = db.session.get(Organization, slug)
    if org is None:
        raise AppError('MD-ORG-0104', f"조직 '{slug}' 을 찾을 수 없습니다.")
    if org.kind != 'org':
        raise AppError('MD-ORG-0105', '개인 공간은 지울 수 없습니다.')
    if slug == ROOT_SLUG:
        raise AppError('MD-ORG-0106', '최상위 조직은 지울 수 없습니다.')

    children = Organization.query.filter_by(parent_slug=slug).count()
    if children:
        raise AppError('MD-ORG-0107',
                       f'하위 조직이 {children}개 있습니다. 먼저 옮기거나 지워 주세요.')

    mounted = CardMount.query.filter_by(org_slug=slug).count()
    if mounted:
        raise AppError('MD-ORG-0108',
                       f'이 조직에 게시된 카드가 {mounted}개 있습니다. '
                       f'먼저 게시를 내려 주세요.')

    db.session.delete(org)
    db.session.commit()
