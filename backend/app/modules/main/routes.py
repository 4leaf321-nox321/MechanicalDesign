"""공통 라우트."""

from flask import Blueprint, current_app, jsonify, request

main_bp = Blueprint('main', __name__)


@main_bp.route('/hello', methods=['GET'])
def hello():
    return jsonify({"message": "Hello World"})


@main_bp.route('/config', methods=['GET'])
def client_config():
    """화면이 알아야 하는 서버 쪽 값들.

    지금은 MCP 주소 하나다. 화면이 이 주소를 스스로 지어내면(예: 3010 을 코드에
    박아 두면) 서버를 옮기거나 포트를 바꿨을 때 **화면만 옛 주소를 들고 있게**
    된다. 사용자는 그대로 복사해 붙였다가 연결이 안 되는 이유를 찾게 된다.
    """
    return jsonify({'mcp_url': _mcp_url()})


def _mcp_url():
    """MCP 서버에 붙을 주소.

    설정이 있으면 그것을 쓰고, 없으면 **사용자가 지금 접속한 주소**에서 호스트를
    떼어 MCP 포트를 붙인다. 기본 설치에서는 그게 정확하다 — 사람이 이 앱에
    닿은 주소면 같은 서버의 MCP 에도 닿는다.
    """
    configured = (current_app.config.get('MCP_URL') or '').strip()
    if configured:
        return configured

    # 리버스 프록시 뒤면 Host 가 아니라 X-Forwarded-Host 가 사용자가 친 주소다.
    host = (request.headers.get('X-Forwarded-Host')
            or request.host or '').split(',')[0].strip()
    hostname = host.split(':')[0] if host else 'localhost'
    port = current_app.config.get('MCP_PORT', 3010)
    return f'http://{hostname}:{port}/mcp'
