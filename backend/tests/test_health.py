def test_health_reports_database_up(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.get_json() == {
        "success": True,
        "data": {"service": "menulens-api", "database": "up"},
    }
