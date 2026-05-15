"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-28

Creates: users, chat_sessions, messages tables.
"""
from alembic import op
import sqlalchemy as sa

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('name', sa.String(255), server_default=''),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    op.create_table(
        'chat_sessions',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('user_email', sa.String(255), sa.ForeignKey('users.email', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(500), server_default='New Chat'),
        sa.Column('document_id', sa.String(255), server_default=''),
        sa.Column('company_name', sa.String(255), server_default=''),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_chat_sessions_user_email', 'chat_sessions', ['user_email'])

    op.create_table(
        'messages',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('session_id', sa.String(255), sa.ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('citations', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_messages_session_id', 'messages', ['session_id'])


def downgrade() -> None:
    op.drop_index('ix_messages_session_id', table_name='messages')
    op.drop_table('messages')
    op.drop_index('ix_chat_sessions_user_email', table_name='chat_sessions')
    op.drop_table('chat_sessions')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
