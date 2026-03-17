import os
import sys
import pytest

# Ensure backend/ is on the path so `import database` etc. works
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def tmp_db(monkeypatch, tmp_path):
    """Provide a fresh, initialised temporary SQLite database for each test."""
    db_file = str(tmp_path / "test.db")
    import database as db
    monkeypatch.setattr(db, "DB_PATH", db_file)
    db.init_db()
    return db_file


@pytest.fixture
def client(tmp_db):
    """FastAPI TestClient wired to the temporary database."""
    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app)
