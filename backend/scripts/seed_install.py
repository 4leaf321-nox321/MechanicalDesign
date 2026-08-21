"""설치 시드 — 초기 관리자 계정 하나.

**멱등하다.** 이미 있으면 아무것도 바꾸지 않는다 — 특히 비밀번호를 되돌리지
않는다. 설치가 중간에 끊겨 다시 돌릴 때 운영 계정의 비밀번호가 초기값으로
되돌아가면 사고다.

비밀번호를 인자로 주지 않으면 난수로 만들어 **화면에 한 번만** 출력한다.
어디에도 저장하지 않으므로 그 출력을 놓치면 다시 볼 수 없고, 그때는 이 계정을
지우고 다시 만들거나 DB 를 직접 고쳐야 한다. 대신 첫 로그인에서 변경이
강제되므로 그 값이 오래 남지 않는다.

사용:
    python scripts/seed_install.py                    # 비밀번호 자동 생성
    python scripts/seed_install.py --password '...'   # 직접 지정
    python scripts/seed_install.py --email admin@example.com --name '홍길동'
"""

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.modules.accounts.models import User  # noqa: E402
from app.modules.auth import security  # noqa: E402

# 아이디에 이메일 형식을 강제하지 않는다(modules/accounts/services.py 참조).
# 폐쇄망 사내 계정은 'admin' 처럼 짧은 아이디를 쓰는 편이 실제로 편하다.
DEFAULT_EMAIL = 'admin'
DEFAULT_NAME = '시스템 관리자'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--email', default=DEFAULT_EMAIL)
    parser.add_argument('--name', default=DEFAULT_NAME)
    parser.add_argument('--password', default=None, help='생략하면 난수로 만든다')
    parser.add_argument(
        '--no-force-change',
        action='store_true',
        help='첫 로그인 시 비밀번호 변경 강제를 끈다 (개발·시험용)',
    )
    args = parser.parse_args()

    # `.env` 의 FLASK_ENV 가 production 이면 create_app 이 기본 비밀키를 거부한다.
    # 설치 스크립트가 그 검사에 걸리는 것이 맞다 — 비밀키 없이 만든 계정은
    # 위조 가능한 토큰으로 로그인하게 된다.
    app = create_app()
    with app.app_context():
        email = (args.email or '').strip().lower()
        existing = User.query.filter_by(email=email).first()
        if existing is not None:
            print(f'관리자 이미 있음: {email} — 비밀번호를 바꾸지 않았습니다.')
            # 권한만은 보장한다. 실수로 내려간 채 남아 있으면 아무도 계정을
            # 관리할 수 없다.
            changed = False
            if not existing.is_admin:
                existing.is_admin = True
                changed = True
            if existing.status != 'active' or existing.deleted_at is not None:
                existing.status = 'active'
                existing.deleted_at = None
                changed = True
            if changed:
                db.session.commit()
                print('  → 관리자 권한과 활성 상태를 복구했습니다.')
            return

        password = args.password or security.new_temporary_password()
        # **직접 지정한 비밀번호는 임시 비밀번호가 아니다.** 난수를 발급한 경우에만
        # 변경을 강제한다 — 관리자가 일부러 정한 값을 첫 로그인에서 바꾸라고 하면
        # 그 지정이 무의미해진다.
        force_change = not args.no_force_change and not args.password
        user = User(
            email=email,
            password_hash=security.hash_password(password),
            display_name=(args.name or DEFAULT_NAME).strip(),
            status='active',      # 초기 관리자는 승인 절차를 거치지 않는다
            is_admin=True,
            must_change_password=force_change,
        )
        db.session.add(user)
        db.session.commit()

        print('')
        print('=' * 60)
        print('  초기 관리자 계정을 만들었습니다')
        print('=' * 60)
        print(f'  아이디   : {email}')
        if args.password:
            print('  비밀번호 : (지정한 값)')
        else:
            print(f'  비밀번호 : {password}')
            print('')
            print('  이 비밀번호는 다시 표시되지 않습니다. 지금 기록해 두세요.')
        if force_change:
            print('  첫 로그인 시 비밀번호 변경이 강제됩니다.')
        print('=' * 60)
        print('')


if __name__ == '__main__':
    main()
