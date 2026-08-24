"""조직 트리와 카드 게시

카드가 놓이는 자리를 만든다. 개인 공간에서 태어나 조직에 게시되는 흐름이라,
**기존 카드가 갈 자리를 먼저 만들어 두고 옮긴다.**

옮기지 않으면 배포한 순간 목록이 빈다. 카드는 DB 에 그대로 있는데 어느 조직에도
걸려 있지 않아 화면 어디에도 안 나오고, 사람은 카드가 지워졌다고 생각한다.

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
"""

import sqlalchemy as sa
from alembic import op

revision = 'a9b0c1d2e3f4'
down_revision = 'f8a9b0c1d2e3'
branch_labels = None
depends_on = None

ROOT_SLUG = 'all'


def upgrade():
    op.create_table(
        'organizations',
        sa.Column('slug', sa.String(length=64), primary_key=True),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=False, server_default=''),
        sa.Column('parent_slug', sa.String(length=64), nullable=True),
        sa.Column('color', sa.String(length=7), nullable=False, server_default='#64748b'),
        sa.Column('kind', sa.String(length=16), nullable=False, server_default='org'),
        sa.Column('owner_user_id', sa.Integer(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        # 상위를 지울 때 하위가 딸려 사라지지 않게 한다. 사라지는 것은 조직
        # 한 줄이 아니라 그 아래 게시된 카드 전부의 자리다.
        sa.ForeignKeyConstraint(['parent_slug'], ['organizations.slug'],
                                ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['owner_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('owner_user_id', name='uq_org_owner_user'),
    )
    op.create_index('ix_organizations_parent_slug', 'organizations', ['parent_slug'])
    op.create_index('ix_organizations_owner_user_id', 'organizations', ['owner_user_id'])

    op.create_table(
        'card_mounts',
        sa.Column('card_id', sa.Integer(), primary_key=True),
        sa.Column('org_slug', sa.String(length=64), primary_key=True),
        sa.Column('mounted_by_id', sa.Integer(), nullable=True),
        sa.Column('mounted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['org_slug'], ['organizations.slug'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['mounted_by_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_card_mounts_org_slug', 'card_mounts', ['org_slug'])

    # 카드의 **집** — 태어난 개인 공간. 조직 게시(card_mounts)와는 다른 축이다.
    # 게시를 전부 내려도 카드는 만든 사람의 공간에 남아 있어야 한다.
    op.add_column('cards', sa.Column('home_org_slug', sa.String(length=64), nullable=True))
    op.create_foreign_key('fk_cards_home_org', 'cards', 'organizations',
                          ['home_org_slug'], ['slug'], ondelete='SET NULL')
    op.create_index('ix_cards_home_org_slug', 'cards', ['home_org_slug'])

    # --- 여기서부터 데이터 이관 -------------------------------------------------
    conn = op.get_bind()

    conn.execute(sa.text("""
        INSERT INTO organizations (slug, name, description, parent_slug, color,
                                   kind, sort_order, created_at)
        VALUES (:slug, '전사', '모두가 함께 보는 자리', NULL, '#3498db', 'org', 0, NOW())
    """), {'slug': ROOT_SLUG})

    # 사람마다 개인 공간. 이미 있는 계정도 카드를 만들 자리가 있어야 한다.
    conn.execute(sa.text("""
        INSERT INTO organizations (slug, name, description, parent_slug, color,
                                   kind, owner_user_id, sort_order, created_at)
        SELECT 'personal-' || u.id, u.display_name, '개인 공간', NULL, '#94a3b8',
               'personal', u.id, 0, NOW()
        FROM users u
        WHERE u.deleted_at IS NULL
    """))

    # 만든 사람이 있는 카드는 그 사람의 개인 공간을 집으로 삼는다.
    conn.execute(sa.text("""
        UPDATE cards SET home_org_slug = 'personal-' || created_by_id
        WHERE created_by_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM organizations o
                      WHERE o.slug = 'personal-' || cards.created_by_id)
    """))

    # **게시된 카드는 전사에 걸어 둔다.** 인증이 붙기 전에 만들어져 만든 사람이
    # NULL 인 카드도 여기 걸린다 — 집이 없어도 보이기는 해야 한다.
    conn.execute(sa.text("""
        INSERT INTO card_mounts (card_id, org_slug, mounted_by_id, mounted_at)
        SELECT c.id, :slug, c.published_by_id, COALESCE(c.published_at, NOW())
        FROM cards c
        WHERE c.status = 'published'
    """), {'slug': ROOT_SLUG})


def downgrade():
    op.drop_index('ix_cards_home_org_slug', table_name='cards')
    op.drop_constraint('fk_cards_home_org', 'cards', type_='foreignkey')
    op.drop_column('cards', 'home_org_slug')

    op.drop_index('ix_card_mounts_org_slug', table_name='card_mounts')
    op.drop_table('card_mounts')

    op.drop_index('ix_organizations_owner_user_id', table_name='organizations')
    op.drop_index('ix_organizations_parent_slug', table_name='organizations')
    op.drop_table('organizations')
