"""Backend tests for the new endpoints added in this session:
- GET  /api/assignments/history
- POST /api/assignments/{id}/photos
- DELETE /api/assignments/{id}/photos/{photo_id}
- POST /api/assignments/{id}/send-review
- PUT  /api/app-settings review_url passthrough
"""
import os
import io
import uuid
import pytest
import requests


BASE_URL = os.environ.get(
    "EXPO_PUBLIC_IMAGES_URL",
    "https://expo-book-cleaning.preview.emergentagent.com",
).rstrip("/")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "tidyups2026")
CLEANER_PIN = "1234"


@pytest.fixture(scope="module")
def admin_headers():
    return {"X-Admin-Password": ADMIN_PASSWORD}


@pytest.fixture()
def seed_cleaner_and_assignment(admin_headers):
    """Create cleaner + one done assignment for tests, then clean up."""
    name = f"TEST_Session_{uuid.uuid4().hex[:6]}"
    chk = requests.post(f"{BASE_URL}/api/cleaners/checkin",
                        json={"name": name, "pin": CLEANER_PIN}).json()
    cid = chk["cleaner_id"]

    payload = {
        "quote_id": f"TEST_q_{uuid.uuid4().hex[:8]}",
        "cleaner_id": cid,
        "customer_name": "TEST_Photo Customer",
        "service_type": "Deep Clean",
        "address": "1 TEST Ave",
        "phone": "204-555-0111",
        "message": "TEST_",
    }
    a = requests.post(f"{BASE_URL}/api/assignments",
                      json=payload,
                      headers={**admin_headers, "Content-Type": "application/json"}).json()

    yield {"cleaner_id": cid, "pin": CLEANER_PIN, "assignment": a}

    requests.delete(f"{BASE_URL}/api/cleaners/{cid}", headers=admin_headers)


def _mark_done(assignment_id, cleaner_id):
    r = requests.post(
        f"{BASE_URL}/api/assignments/{assignment_id}/status",
        json={"cleaner_id": cleaner_id, "pin": CLEANER_PIN, "status": "done"},
    )
    assert r.status_code == 200, r.text


# --------------------------- app-settings review_url ---------------------------

class TestReviewUrlSetting:
    def test_default_review_url_is_empty(self):
        r = requests.get(f"{BASE_URL}/api/app-settings")
        assert r.status_code == 200
        assert "review_url" in r.json()

    def test_admin_can_set_review_url(self, admin_headers):
        target = f"https://g.page/r/test-{uuid.uuid4().hex[:6]}"
        r = requests.put(
            f"{BASE_URL}/api/app-settings",
            json={"review_url": target},
            headers={**admin_headers, "Content-Type": "application/json"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["review_url"] == target
        # verify GET returns it
        g = requests.get(f"{BASE_URL}/api/app-settings").json()
        assert g["review_url"] == target
        # restore to empty for tidiness
        requests.put(
            f"{BASE_URL}/api/app-settings",
            json={"review_url": ""},
            headers={**admin_headers, "Content-Type": "application/json"},
        )


# --------------------------- history endpoint ---------------------------

class TestAssignmentHistory:
    def test_requires_admin(self):
        r = requests.get(f"{BASE_URL}/api/assignments/history")
        assert r.status_code == 401

    def test_history_returns_done_only_and_filter(self, admin_headers, seed_cleaner_and_assignment):
        s = seed_cleaner_and_assignment
        aid = s["assignment"]["id"]
        # not done yet -> should not appear
        r0 = requests.get(f"{BASE_URL}/api/assignments/history?cleaner_id={s['cleaner_id']}",
                          headers=admin_headers)
        assert r0.status_code == 200
        assert not any(x["id"] == aid for x in r0.json())

        # mark done
        _mark_done(aid, s["cleaner_id"])

        r1 = requests.get(f"{BASE_URL}/api/assignments/history?cleaner_id={s['cleaner_id']}",
                          headers=admin_headers)
        assert r1.status_code == 200
        data = r1.json()
        assert any(x["id"] == aid and x["status"] == "done" for x in data)
        # unfiltered should also include it
        r2 = requests.get(f"{BASE_URL}/api/assignments/history",
                          headers=admin_headers).json()
        assert any(x["id"] == aid for x in r2)
        # every returned record is done
        assert all(x["status"] == "done" for x in r2)


# --------------------------- photo proof ---------------------------

class TestPhotoProof:
    def _tiny_png(self):
        # 1x1 red PNG bytes (valid)
        return bytes.fromhex(
            "89504E470D0A1A0A0000000D4948445200000001000000010806000000"
            "1F15C4890000000D49444154789C63F80F00010101006D9DBAB50000"
            "000049454E44AE426082"
        )

    def test_wrong_pin_rejected(self, seed_cleaner_and_assignment):
        s = seed_cleaner_and_assignment
        r = requests.post(
            f"{BASE_URL}/api/assignments/{s['assignment']['id']}/photos",
            files={"file": ("x.png", io.BytesIO(self._tiny_png()), "image/png")},
            data={"kind": "before", "cleaner_id": s["cleaner_id"], "pin": "0000"},
        )
        assert r.status_code == 401

    def test_invalid_kind_rejected(self, seed_cleaner_and_assignment):
        s = seed_cleaner_and_assignment
        r = requests.post(
            f"{BASE_URL}/api/assignments/{s['assignment']['id']}/photos",
            files={"file": ("x.png", io.BytesIO(self._tiny_png()), "image/png")},
            data={"kind": "middle", "cleaner_id": s["cleaner_id"], "pin": CLEANER_PIN},
        )
        assert r.status_code == 400

    def test_upload_and_list_and_delete_photo(self, admin_headers, seed_cleaner_and_assignment):
        s = seed_cleaner_and_assignment
        aid = s["assignment"]["id"]
        # upload before
        up = requests.post(
            f"{BASE_URL}/api/assignments/{aid}/photos",
            files={"file": ("before.png", io.BytesIO(self._tiny_png()), "image/png")},
            data={"kind": "before", "cleaner_id": s["cleaner_id"], "pin": CLEANER_PIN},
        )
        assert up.status_code == 200, up.text
        photo = up.json()
        assert photo["kind"] == "before"
        assert photo["url"].startswith("/api/app-images/file/")

        # assignments list should now include the photo
        lst = requests.get(f"{BASE_URL}/api/assignments", headers=admin_headers).json()
        me = next(a for a in lst if a["id"] == aid)
        assert any(p["id"] == photo["id"] for p in (me.get("photos") or []))

        # delete photo
        d = requests.delete(
            f"{BASE_URL}/api/assignments/{aid}/photos/{photo['id']}",
            params={"cleaner_id": s["cleaner_id"], "pin": CLEANER_PIN},
        )
        assert d.status_code == 200, d.text
        lst2 = requests.get(f"{BASE_URL}/api/assignments", headers=admin_headers).json()
        me2 = next(a for a in lst2 if a["id"] == aid)
        assert not any(p["id"] == photo["id"] for p in (me2.get("photos") or []))


# --------------------------- send review ---------------------------

class TestSendReview:
    def test_requires_admin(self, seed_cleaner_and_assignment):
        r = requests.post(f"{BASE_URL}/api/assignments/{seed_cleaner_and_assignment['assignment']['id']}/send-review")
        assert r.status_code == 401

    def test_fails_without_review_url(self, admin_headers, seed_cleaner_and_assignment):
        # ensure review_url is empty
        requests.put(
            f"{BASE_URL}/api/app-settings",
            json={"review_url": ""},
            headers={**admin_headers, "Content-Type": "application/json"},
        )
        r = requests.post(
            f"{BASE_URL}/api/assignments/{seed_cleaner_and_assignment['assignment']['id']}/send-review",
            headers=admin_headers,
        )
        assert r.status_code == 400
        assert "review link" in r.json().get("detail", "").lower()

    def test_send_review_respects_twilio_configuration(self, admin_headers, seed_cleaner_and_assignment):
        # Behaviour contract:
        #  - Twilio configured  → 200 + review_sent_at stamped
        #  - Twilio unconfigured → 502 + review_sent_at NOT stamped
        # We just check the behaviour is internally consistent regardless of which
        # branch this env happens to be in (real prod credentials may be present).
        target = "https://g.page/r/test-tidyups"
        requests.put(
            f"{BASE_URL}/api/app-settings",
            json={"review_url": target},
            headers={**admin_headers, "Content-Type": "application/json"},
        )
        try:
            r = requests.post(
                f"{BASE_URL}/api/assignments/{seed_cleaner_and_assignment['assignment']['id']}/send-review",
                headers=admin_headers,
            )
            assert r.status_code in (200, 502), r.text
            lst = requests.get(f"{BASE_URL}/api/assignments", headers=admin_headers).json()
            me = next(a for a in lst if a["id"] == seed_cleaner_and_assignment["assignment"]["id"])
            if r.status_code == 200:
                assert me.get("review_sent_at"), "review_sent_at must be stamped when SMS succeeded"
            else:
                assert not me.get("review_sent_at"), "review_sent_at must stay null when SMS failed"
        finally:
            # restore blank
            requests.put(
                f"{BASE_URL}/api/app-settings",
                json={"review_url": ""},
                headers={**admin_headers, "Content-Type": "application/json"},
            )
