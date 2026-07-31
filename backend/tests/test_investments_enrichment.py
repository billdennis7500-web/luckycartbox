"""Backend test for /api/investments enrichment (product_image_url + product_tier)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://dark-gold-ui-build.preview.emergentagent.com"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"phone": "+2348099887711", "password": "pass1234"})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


def test_investments_includes_enrichment_fields(session):
    r = session.get(f"{BASE_URL}/api/investments")
    assert r.status_code == 200, r.text
    data = r.json()
    # response could be a list or an obj with items
    items = data if isinstance(data, list) else data.get("investments") or data.get("items") or []
    assert isinstance(items, list) and len(items) >= 1, f"expected >=1 investment, got: {data}"
    for inv in items:
        assert "product_image_url" in inv, f"missing product_image_url in {inv.keys()}"
        assert "product_tier" in inv, f"missing product_tier in {inv.keys()}"
        # types: str/None
        assert inv["product_image_url"] is None or isinstance(inv["product_image_url"], str)
        assert inv["product_tier"] is None or isinstance(inv["product_tier"], str)
        # no mongo _id leak
        assert "_id" not in inv
    print(f"OK — {len(items)} investment(s) with enrichment. sample:",
          {"tier": items[0].get("product_tier"),
           "has_image": bool(items[0].get("product_image_url"))})
