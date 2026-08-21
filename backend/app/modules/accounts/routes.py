"""계정 관리 라우터 — 전부 관리자 전용.

셀프 가입(`POST /api/auth/signup`)만 인증 밖에 있고, 여기는 "계정 자체의 생애"
(승인·생성·정지·삭제·비밀번호)를 다룬다. 로그인·세션은 auth 모듈의 일이다.
두 책임을 섞으면 화면도 섞인다.
"""

from flask import Blueprint, g, jsonify, request

from app.modules.accounts import services
from app.shared.auth import admin_required

accounts_bp = Blueprint('accounts', __name__)


@accounts_bp.route('', methods=['GET'])
@admin_required
def list_accounts():
    status = request.args.get('status') or None
    try:
        limit = min(max(int(request.args.get('limit', 200)), 1), 500)
        offset = max(int(request.args.get('offset', 0)), 0)
    except (TypeError, ValueError):
        limit, offset = 200, 0
    users = services.list_accounts(status=status, limit=limit, offset=offset)
    return jsonify([u.to_dict() for u in users])


@accounts_bp.route('', methods=['POST'])
@admin_required
def create_account():
    data = request.get_json(silent=True) or {}
    user, temporary = services.create_account(
        email=data.get('email'),
        display_name=data.get('display_name'),
        is_admin=data.get('is_admin', False),
        actor=g.current_user,
    )
    # **임시 비밀번호는 여기서 한 번만 나간다.** 저장하지 않으므로 화면을
    # 닫으면 다시 볼 수 없고, 그때는 재설정을 다시 눌러야 한다.
    return jsonify({'account': user.to_dict(), 'temporary_password': temporary}), 201


@accounts_bp.route('/<int:account_id>/approve', methods=['POST'])
@admin_required
def approve(account_id):
    user = services.approve(account_id, actor=g.current_user)
    return jsonify(user.to_dict())


@accounts_bp.route('/<int:account_id>/reject', methods=['POST'])
@admin_required
def reject(account_id):
    data = request.get_json(silent=True) or {}
    user = services.reject(account_id, actor=g.current_user, note=data.get('note'))
    return jsonify(user.to_dict())


@accounts_bp.route('/<int:account_id>/suspend', methods=['POST'])
@admin_required
def suspend(account_id):
    user = services.set_status(account_id, 'suspended', actor=g.current_user)
    return jsonify(user.to_dict())


@accounts_bp.route('/<int:account_id>/activate', methods=['POST'])
@admin_required
def activate(account_id):
    user = services.set_status(account_id, 'active', actor=g.current_user)
    return jsonify(user.to_dict())


@accounts_bp.route('/<int:account_id>/admin', methods=['PUT'])
@admin_required
def set_admin(account_id):
    data = request.get_json(silent=True) or {}
    user = services.set_admin(account_id, bool(data.get('is_admin')), actor=g.current_user)
    return jsonify(user.to_dict())


@accounts_bp.route('/<int:account_id>/reset-password', methods=['POST'])
@admin_required
def reset_password(account_id):
    user, temporary = services.reset_password(account_id)
    return jsonify({'account': user.to_dict(), 'temporary_password': temporary})


@accounts_bp.route('/<int:account_id>', methods=['DELETE'])
@admin_required
def delete_account(account_id):
    user = services.delete_account(account_id, actor=g.current_user)
    return jsonify(user.to_dict())
