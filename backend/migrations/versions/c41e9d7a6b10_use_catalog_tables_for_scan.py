"""store scanned dishes in catalog tables

Revision ID: c41e9d7a6b10
Revises: a3f8c2b91e44
Create Date: 2026-10-19 02:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "c41e9d7a6b10"
down_revision = "a3f8c2b91e44"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("dish_nutrition", schema=None) as batch_op:
        batch_op.add_column(sa.Column("fiber_g", sa.Float(), nullable=True))

    with op.batch_alter_table("known_dishes", schema=None) as batch_op:
        batch_op.drop_index("ix_known_dishes_name")
    op.drop_table("known_dishes")


def downgrade():
    op.create_table(
        "known_dishes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("name_normalized", sa.String(length=180), nullable=False),
        sa.Column("calories", sa.Integer(), nullable=True),
        sa.Column("carbohydrates", sa.Integer(), nullable=True),
        sa.Column("fats", sa.Integer(), nullable=True),
        sa.Column("proteins", sa.Integer(), nullable=True),
        sa.Column("fiber", sa.Integer(), nullable=True),
        sa.Column("associated_allergies", mysql.JSON(), nullable=True),
        sa.Column("flavor", sa.String(length=40), nullable=True),
        sa.Column("spice_level", sa.String(length=40), nullable=True),
        sa.Column("basic_ingredients", mysql.JSON(), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name_normalized", name="uq_known_dishes_name_normalized"),
    )
    with op.batch_alter_table("known_dishes", schema=None) as batch_op:
        batch_op.create_index("ix_known_dishes_name", ["name"], unique=False)

    with op.batch_alter_table("dish_nutrition", schema=None) as batch_op:
        batch_op.drop_column("fiber_g")
