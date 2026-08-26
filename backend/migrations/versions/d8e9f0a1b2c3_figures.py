"""도해 — 앱이 그리는 형상 그림.

올리는 파일이 아니라 **종류와 배선**만 저장한다. 값이 바뀌면 그림도 따라 바뀌어야
하기 때문이다 — 파일로 두면 첫 변경에서 낡는다.

배치(`widget_placements`)의 「셋 중 하나」 제약도 여기서 고친다. 전에는 변수·이미지
둘 중 하나였다.

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-08-26
"""
import sqlalchemy as sa
from alembic import op

revision = 'd8e9f0a1b2c3'
down_revision = 'c7d8e9f0a1b2'
branch_labels = None
depends_on = None

_OLD_CHECK = ('(variable_id IS NOT NULL AND image_id IS NULL)'
              ' OR (variable_id IS NULL AND image_id IS NOT NULL)')
_NEW_CHECK = ('(variable_id IS NOT NULL)::int + (image_id IS NOT NULL)::int'
              ' + (figure_id IS NOT NULL)::int = 1')


def upgrade():
    op.create_table(
        'figures',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('card_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=40), nullable=False),
        sa.Column('mapping', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('caption', sa.String(length=200), nullable=False, server_default=''),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_figures_card_id'), 'figures', ['card_id'])

    op.add_column('widget_placements', sa.Column('figure_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_widget_placements_figure_id'),
                    'widget_placements', ['figure_id'])
    op.create_foreign_key('fk_widget_placements_figure', 'widget_placements',
                          'figures', ['figure_id'], ['id'], ondelete='CASCADE')
    op.create_unique_constraint('uq_placement_container_figure', 'widget_placements',
                                ['container_id', 'figure_id'])

    # 「둘 중 하나」 를 「셋 중 하나」 로. 제약을 안 고치면 도해 배치가 전부 막힌다.
    op.drop_constraint('ck_placement_exactly_one_target', 'widget_placements',
                       type_='check')
    op.create_check_constraint('ck_placement_exactly_one_target', 'widget_placements',
                               _NEW_CHECK)


def downgrade():
    # 도해 배치가 남아 있으면 옛 제약을 못 건다. 배치를 먼저 치운다 —
    # 되돌리는 마당에 도해는 어차피 사라진다.
    op.execute('DELETE FROM widget_placements WHERE figure_id IS NOT NULL')

    op.drop_constraint('ck_placement_exactly_one_target', 'widget_placements',
                       type_='check')
    op.create_check_constraint('ck_placement_exactly_one_target', 'widget_placements',
                               _OLD_CHECK)

    op.drop_constraint('uq_placement_container_figure', 'widget_placements',
                       type_='unique')
    op.drop_constraint('fk_widget_placements_figure', 'widget_placements',
                       type_='foreignkey')
    op.drop_index(op.f('ix_widget_placements_figure_id'), table_name='widget_placements')
    op.drop_column('widget_placements', 'figure_id')

    op.drop_index(op.f('ix_figures_card_id'), table_name='figures')
    op.drop_table('figures')
