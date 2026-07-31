"""Backend tests for the Dispatch (Job Assignments) feature.

Covers:
- POST /api/assignments  (admin auth, cleaner_id existence, cleaner_name snapshot, one-per-quote replace)
- GET  /api/assignments  (admin list)
- DELETE /api/assignments/{id} (admin remove, 404 unknown)
- GET  /api/cleaners/{id}/jobs (X-Cleaner-Pin filter to status=assigned)
- POST /api/assignments/{id}/done (pin gated, cleaner_id must match)
- DELETE /api/cleaners/{id} cascade removes that cleaner's assignments

All test data is prefixed with TEST_ and cleaned up in fixture teardown.
"""

import os
import uuid
import pytest
import requests


# LOCAL backend (assignments live here; production URL is not used)
BASE_URL = os.environ.get(
    "EXPO_PUBLIC_IMAGES_URL",
    "https://expo-book-cleaning.preview.emergentagent.com",
).rstrip("/")

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "tidyups2026")
CLEANER_PIN = "1234"


# --------------------------- fixtures ---------------------------

@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_headers():
    return {"X-Admin-Password": ADMIN_PASSWORD, "Content-Type": "application/json"}


@pytest.fixture()
def seed_cleaner(api, admin_headers):
    """Create a fresh cleaner via /cleaners/checkin then clean up after test."""
    name = f"TEST_Dispatch_{uuid.uuid4().hex[:6]}"
    r = api.post(f"{BASE_URL}/api/cleaners/checkin",
                 json={"name": name, "pin": CLEANER_PIN})
    assert r.status_code == 200, f"checkin failed: {r.status_code} {r.text}"
    body = r.json()
    cleaner_id = body["cleaner_id"]

    yield {"id": cleaner_id, "name": body["name"], "pin": CLEANER_PIN}

    # Teardown: delete cleaner (also cascades assignments)
    try:
        requests.delete(f"{BASE_URL}/api/cleaners/{cleaner_id}",
                        headers={"X-Admin-Password": ADMIN_PASSWORD})
    except Exception:
        pass


def _mk_payload(cleaner_id, quote_id=None):
    return {
        "quote_id": quote_id or f"TEST_quote_{uuid.uuid4().hex[:8]}",
        "cleaner_id": cleaner_id,
        "customer_name": "TEST_Jane Doe",
        "service_type": "Deep Clean",
        "address": "123 TEST Street, Winnipeg",
        "phone": "204-555-0100",
        "preferred_date": "2026-01-15",
        "message": "TEST_ dispatch",
    }


# --------------------------- POST /assignments ---------------------------

class TestCreateAssignment:
    def test_requires_admin_pw(self, api, seed_cleaner):
        r = api.post(f"{BASE_URL}/api/assignments",
                     json=_mk_payload(seed_cleaner["id"]))
        assert r.status_code == 401, r.text

    def test_wrong_admin_pw(self, api, seed_cleaner):
        r = api.post(f"{BASE_URL}/api/assignments",
                     json=_mk_payload(seed_cleaner["id"]),
                     headers={"X-Admin-Password": "wrong"})
        assert r.status_code == 401

    def test_404_unknown_cleaner(self, api, admin_headers):
        r = api.post(f"{BASE_URL}/api/assignments",
                     json=_mk_payload("no-such-cleaner-id"),
                     headers=admin_headers)
        assert r.status_code == 404

    def test_create_snapshots_cleaner_name_and_status(self, api, admin_headers, seed_cleaner):
        payload = _mk_payload(seed_cleaner["id"])
        r = api.post(f"{BASE_URL}/api/assignments", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["cleaner_id"] == seed_cleaner["id"]
        assert data["cleaner_name"] == seed_cleaner["name"]
        assert data["status"] == "assigned"
        assert data["customer_name"] == payload["customer_name"]
        assert data["service_type"] == payload["service_type"]
        assert data["address"] == payload["address"]
        assert data["phone"] == payload["phone"]
        assert data["quote_id"] == payload["quote_id"]
        assert "id" in data and isinstance(data["id"], str) and data["id"]
        # MongoDB _id should not leak
        assert "_id" not in data

        # cleanup
        requests.delete(f"{BASE_URL}/api/assignments/{data['id']}",
                        headers={"X-Admin-Password": ADMIN_PASSWORD})

    def test_re_assign_same_quote_replaces(self, api, admin_headers, seed_cleaner):
        quote_id = f"TEST_quote_replace_{uuid.uuid4().hex[:8]}"
        first = api.post(f"{BASE_URL}/api/assignments",
                         json=_mk_payload(seed_cleaner["id"], quote_id=quote_id),
                         headers=admin_headers).json()
        second_payload = _mk_payload(seed_cleaner["id"], quote_id=quote_id)
        second_payload["customer_name"] = "TEST_UpdatedName"
        second = api.post(f"{BASE_URL}/api/assignments",
                          json=second_payload,
                          headers=admin_headers).json()
        assert second["id"] != first["id"]

        # verify only ONE assignment for this quote_id
        listing = api.get(f"{BASE_URL}/api/assignments",
                          headers={"X-Admin-Password": ADMIN_PASSWORD}).json()
        matching = [a for a in listing if a["quote_id"] == quote_id]
        assert len(matching) == 1, f"expected 1 assignment per quote, got {len(matching)}"
        assert matching[0]["id"] == second["id"]
        assert matching[0]["customer_name"] == "TEST_UpdatedName"

        # cleanup
        requests.delete(f"{BASE_URL}/api/assignments/{second['id']}",
                        headers={"X-Admin-Password": ADMIN_PASSWORD})

    # NEW FIX (iter 11) — re-assigning after done must PRESERVE the done record
    def test_re_assign_after_done_preserves_history(self, api, admin_headers, seed_cleaner):
        quote_id = f"TEST_quote_preserve_{uuid.uuid4().hex[:8]}"
        # 1. Create first assignment for this quote
        first = api.post(f"{BASE_URL}/api/assignments",
                         json=_mk_payload(seed_cleaner["id"], quote_id=quote_id),
                         headers=admin_headers).json()
        assert first["status"] == "assigned"

        # 2. Mark it done via /status endpoint
        status_resp = api.post(
            f"{BASE_URL}/api/assignments/{first['id']}/status",
            json={"cleaner_id": seed_cleaner["id"], "pin": CLEANER_PIN, "status": "done"},
        )
        assert status_resp.status_code == 200

        # 3. Re-assign the same quote — must NOT delete the done record
        second = api.post(f"{BASE_URL}/api/assignments",
                          json=_mk_payload(seed_cleaner["id"], quote_id=quote_id),
                          headers=admin_headers).json()
        assert second["id"] != first["id"]
        assert second["status"] == "assigned"

        # 4. List should contain BOTH records for this quote_id
        listing = api.get(f"{BASE_URL}/api/assignments",
                          headers={"X-Admin-Password": ADMIN_PASSWORD}).json()
        matching = [a for a in listing if a["quote_id"] == quote_id]
        assert len(matching) == 2, f"expected 2 (1 done + 1 assigned), got {len(matching)}: {matching}"
        statuses = sorted([a["status"] for a in matching])
        assert statuses == ["assigned", "done"], f"unexpected statuses: {statuses}"
        # done record must still be the original id
        done_rec = next(a for a in matching if a["status"] == "done")
        assert done_rec["id"] == first["id"]
        # done record must have completed_at
        assert done_rec.get("completed_at"), "done record should retain completed_at"

        # 5. Re-assigning AGAIN (with a still-active assignment) should replace the active
        #    but leave the done record intact
        third = api.post(f"{BASE_URL}/api/assignments",
                        json=_mk_payload(seed_cleaner["id"], quote_id=quote_id),
                        headers=admin_headers).json()
        listing2 = api.get(f"{BASE_URL}/api/assignments",
                          headers={"X-Admin-Password": ADMIN_PASSWORD}).json()
        matching2 = [a for a in listing2 if a["quote_id"] == quote_id]
        assert len(matching2) == 2, f"expected still 2, got {len(matching2)}"
        assert any(a["id"] == first["id"] and a["status"] == "done" for a in matching2)
        assert any(a["id"] == third["id"] and a["status"] == "assigned" for a in matching2)
        assert not any(a["id"] == second["id"] for a in matching2), "prev active should be replaced"

        # cleanup — remove both records
        for aid in (first["id"], third["id"]):
            requests.delete(f"{BASE_URL}/api/assignments/{aid}",
                            headers={"X-Admin-Password": ADMIN_PASSWORD})


# --------------------------- GET / DELETE /assignments ---------------------------

class TestListAndDeleteAssignment:
    def test_list_requires_admin(self, api):
        r = api.get(f"{BASE_URL}/api/assignments")
        assert r.status_code == 401

    def test_list_and_delete_flow(self, api, admin_headers, seed_cleaner):
        created = api.post(f"{BASE_URL}/api/assignments",
                           json=_mk_payload(seed_cleaner["id"]),
                           headers=admin_headers).json()
        aid = created["id"]

        listing = api.get(f"{BASE_URL}/api/assignments",
                          headers={"X-Admin-Password": ADMIN_PASSWORD})
        assert listing.status_code == 200
        ids = [a["id"] for a in listing.json()]
        assert aid in ids

        d = requests.delete(f"{BASE_URL}/api/assignments/{aid}",
                            headers={"X-Admin-Password": ADMIN_PASSWORD})
        assert d.status_code == 200
        assert d.json().get("ok") is True

        # 404 on unknown
        d2 = requests.delete(f"{BASE_URL}/api/assignments/does-not-exist",
                             headers={"X-Admin-Password": ADMIN_PASSWORD})
        assert d2.status_code == 404


# --------------------------- GET /cleaners/{id}/jobs ---------------------------

class TestCleanerJobs:
    def test_wrong_pin_401(self, api, seed_cleaner):
        r = api.get(f"{BASE_URL}/api/cleaners/{seed_cleaner['id']}/jobs",
                    headers={"X-Cleaner-Pin": "0000"})
        assert r.status_code == 401

    def test_returns_only_assigned_status(self, api, admin_headers, seed_cleaner):
        # Create 2 assignments; complete one; only the other should show
        a1 = api.post(f"{BASE_URL}/api/assignments",
                      json=_mk_payload(seed_cleaner["id"]), headers=admin_headers).json()
        a2 = api.post(f"{BASE_URL}/api/assignments",
                      json=_mk_payload(seed_cleaner["id"]), headers=admin_headers).json()

        # Mark a1 done (via new /status endpoint — /done was removed)
        done = api.post(f"{BASE_URL}/api/assignments/{a1['id']}/status",
                        json={"cleaner_id": seed_cleaner["id"], "pin": CLEANER_PIN, "status": "done"})
        assert done.status_code == 200

        jobs = api.get(f"{BASE_URL}/api/cleaners/{seed_cleaner['id']}/jobs",
                       headers={"X-Cleaner-Pin": CLEANER_PIN})
        assert jobs.status_code == 200
        job_ids = [j["id"] for j in jobs.json()]
        assert a2["id"] in job_ids
        assert a1["id"] not in job_ids
        for j in jobs.json():
            assert j["status"] == "assigned"

        # a1 still visible in admin list with status=done
        admin_list = api.get(f"{BASE_URL}/api/assignments",
                             headers={"X-Admin-Password": ADMIN_PASSWORD}).json()
        done_match = [a for a in admin_list if a["id"] == a1["id"]]
        assert done_match and done_match[0]["status"] == "done"

        # cleanup
        for aid in (a1["id"], a2["id"]):
            requests.delete(f"{BASE_URL}/api/assignments/{aid}",
                            headers={"X-Admin-Password": ADMIN_PASSWORD})


# --------------------------- POST /assignments/{id}/status done ---------------------------

class TestCompleteAssignment:
    def test_wrong_pin_401(self, api, admin_headers, seed_cleaner):
        created = api.post(f"{BASE_URL}/api/assignments",
                           json=_mk_payload(seed_cleaner["id"]),
                           headers=admin_headers).json()
        r = api.post(f"{BASE_URL}/api/assignments/{created['id']}/status",
                     json={"cleaner_id": seed_cleaner["id"], "pin": "0000", "status": "done"})
        assert r.status_code == 401
        requests.delete(f"{BASE_URL}/api/assignments/{created['id']}",
                        headers={"X-Admin-Password": ADMIN_PASSWORD})

    def test_wrong_cleaner_id_404(self, api, admin_headers, seed_cleaner):
        created = api.post(f"{BASE_URL}/api/assignments",
                           json=_mk_payload(seed_cleaner["id"]),
                           headers=admin_headers).json()
        r = api.post(f"{BASE_URL}/api/assignments/{created['id']}/status",
                     json={"cleaner_id": "not-this-cleaner", "pin": CLEANER_PIN, "status": "done"})
        assert r.status_code == 404
        requests.delete(f"{BASE_URL}/api/assignments/{created['id']}",
                        headers={"X-Admin-Password": ADMIN_PASSWORD})


# --------------------------- DELETE cleaner cascade ---------------------------

class TestCleanerCascade:
    def test_delete_cleaner_removes_assignments(self, api, admin_headers):
        # Create disposable cleaner
        name = f"TEST_Cascade_{uuid.uuid4().hex[:6]}"
        chk = api.post(f"{BASE_URL}/api/cleaners/checkin",
                       json={"name": name, "pin": CLEANER_PIN}).json()
        cid = chk["cleaner_id"]
        a = api.post(f"{BASE_URL}/api/assignments",
                     json=_mk_payload(cid), headers=admin_headers).json()

        # sanity: assignment present
        listing = api.get(f"{BASE_URL}/api/assignments",
                          headers={"X-Admin-Password": ADMIN_PASSWORD}).json()
        assert any(x["id"] == a["id"] for x in listing)

        # delete cleaner
        d = requests.delete(f"{BASE_URL}/api/cleaners/{cid}",
                            headers={"X-Admin-Password": ADMIN_PASSWORD})
        assert d.status_code == 200

        # cascade: assignment gone
        listing2 = api.get(f"{BASE_URL}/api/assignments",
                           headers={"X-Admin-Password": ADMIN_PASSWORD}).json()
        assert not any(x["id"] == a["id"] for x in listing2), "assignment should be cascade-deleted"
