import os
from dotenv import load_dotenv

load_dotenv()

from app import create_app

app = create_app()

if __name__ == '__main__':
    host = os.environ.get('FLASK_HOST', '0.0.0.0')
    port = int(os.environ.get('FLASK_PORT', 5176))
    env = os.environ.get('FLASK_ENV', 'development')

    if env == 'development':
        print(f"""
    ================================================================
    |         Mechanical Design Backend API Server                 |
    ================================================================
    |  Environment: {env:<45} |
    |  Server:      Flask Development Server                       |
    |  Running on:  http://{host}:{port:<36} |
    ================================================================
        """)
        app.run(
            host=host,
            port=port,
            debug=True,
            threaded=True,
            # **코드가 바뀌면 다시 읽는다.**
            #
            # 껐을 때 실제로 겪은 사고: 모델과 마이그레이션을 바꿔 DB 는 갱신됐는데
            # 서버는 옛 코드를 든 채로 남아, 사라진 컬럼을 조회하다 모든 요청이
            # 500 이 됐다. 화면에는 "정의했던 변수가 통째로 사라진" 것으로 보여
            # 원인을 엉뚱하게 데이터에서 찾게 된다. 재시작을 사람이 기억해야 하는
            # 구조가 문제였다.
            #
            # 끄려면 FLASK_RELOAD=0 (디버거를 붙일 때 등).
            use_reloader=os.environ.get('FLASK_RELOAD', '1') != '0',
        )
    else:
        from waitress import serve
        threads = int(os.environ.get('WAITRESS_THREADS', 8))
        print(f"""
    ================================================================
    |         Mechanical Design Backend API Server                 |
    ================================================================
    |  Environment: {env:<45} |
    |  Server:      Waitress (Production)                          |
    |  Running on:  http://{host}:{port:<36} |
    |  Threads:     {threads:<48} |
    ================================================================
        """)
        serve(app, host=host, port=port, threads=threads)
