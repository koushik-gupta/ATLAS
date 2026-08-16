import pytest
from fastapi.testclient import TestClient
from api.main import app

@pytest.fixture
def client():
    """
    This is a PyTest Fixture. 
    It creates a fake 'TestClient' that can send HTTP requests to our FastAPI app 
    without having to actually start the server on port 8000.
    """
    return TestClient(app)
