import os
from dotenv import load_dotenv

load_dotenv()

from app import create_app

app = create_app()

if __name__ == '__main__':
    host = os.environ.get('FLASK_HOST', '0.0.0.0')
    port = int(os.environ.get('FLASK_PORT', 5174))
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
            use_reloader=False,
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
