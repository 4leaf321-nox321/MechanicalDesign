"""위젯 배치를 표로 분리 — widget_placements

한 위젯(변수·이미지)이 **여러 컨테이너**에 놓일 수 있게 한다. 값은 하나뿐이고
보이는 자리만 여럿이다.

`variables.container_id` / `images.container_id` 는 이 표로 옮기고 **없앤다.**
둘 다 남겨 두면 "어느 쪽이 진짜 배치냐" 가 갈려서 한쪽만 고치는 버그가 생긴다.

되돌리면(downgrade) 컬럼을 되살리고 **배치 중 하나만** 옮겨 담는다 — 원래
컬럼이 하나뿐이라 여러 배치를 표현할 수 없다. 그 경우 나머지 배치는 사라진다.

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-08-21
"""
from alembic import op
import sqlalchemy as sa


revision = 'a3b4c5d6e7f8'
down_revision = 'f2a3b4c5d6e7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'widget_placements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('card_id', sa.Integer(), nullable=False),
        sa.Column('container_id', sa.Integer(), nullable=False),
        sa.Column('variable_id', sa.Integer(), nullable=True),
        sa.Column('image_id', sa.Integer(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True,
                  server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['container_id'], ['containers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['variable_id'], ['variables.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['image_id'], ['images.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('container_id', 'variable_id',
                            name='uq_placement_container_variable'),
        sa.UniqueConstraint('container_id', 'image_id',
                            name='uq_placement_container_image'),
        sa.CheckConstraint(
            '(variable_id IS NOT NULL AND image_id IS NULL)'
            ' OR (variable_id IS NULL AND image_id IS NOT NULL)',
            name='ck_placement_exactly_one_target',
        ),
    )
    op.create_index('ix_widget_placements_card_id', 'widget_placements', ['card_id'])
    op.create_index('ix_widget_placements_container_id', 'widget_placements', ['container_id'])
    op.create_index('ix_widget_placements_variable_id', 'widget_placements', ['variable_id'])
    op.create_index('ix_widget_placements_image_id', 'widget_placements', ['image_id'])

    # 기존 배치를 그대로 옮긴다. container_id 가 비어 있던 것(미배치)은 행을
    # 만들지 않는다 — 배치 행이 없는 것이 곧 미배치다.
    op.execute("""
        INSERT INTO widget_placements (card_id, container_id, variable_id, sort_order)
        SELECT card_id, container_id, id, COALESCE(sort_order, 0)
        FROM variables
        WHERE container_id IS NOT NULL
    """)
    op.execute("""
        INSERT INTO widget_placements (card_id, container_id, image_id, sort_order)
        SELECT card_id, container_id, id, COALESCE(sort_order, 0)
        FROM images
        WHERE container_id IS NOT NULL
    """)

    op.drop_column('variables', 'container_id')
    op.drop_column('images', 'container_id')


def downgrade():
    op.add_column('variables', sa.Column('container_id', sa.Integer(), nullable=True))
    op.add_column('images', sa.Column('container_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_variables_container_id', 'variables', 'containers',
                          ['container_id'], ['id'])
    op.create_foreign_key('fk_images_container_id', 'images', 'containers',
                          ['container_id'], ['id'])

    # 배치가 여럿이면 sort_order 가 가장 작은 것 하나만 되살린다. 나머지는
    # 옛 구조로 표현할 수 없어 버려진다.
    op.execute("""
        UPDATE variables v SET container_id = p.container_id
        FROM (
            SELECT DISTINCT ON (variable_id) variable_id, container_id
            FROM widget_placements
            WHERE variable_id IS NOT NULL
            ORDER BY variable_id, sort_order, id
        ) p
        WHERE p.variable_id = v.id
    """)
    op.execute("""
        UPDATE images i SET container_id = p.container_id
        FROM (
            SELECT DISTINCT ON (image_id) image_id, container_id
            FROM widget_placements
            WHERE image_id IS NOT NULL
            ORDER BY image_id, sort_order, id
        ) p
        WHERE p.image_id = i.id
    """)

    op.drop_index('ix_widget_placements_image_id', table_name='widget_placements')
    op.drop_index('ix_widget_placements_variable_id', table_name='widget_placements')
    op.drop_index('ix_widget_placements_container_id', table_name='widget_placements')
    op.drop_index('ix_widget_placements_card_id', table_name='widget_placements')
    op.drop_table('widget_placements')
