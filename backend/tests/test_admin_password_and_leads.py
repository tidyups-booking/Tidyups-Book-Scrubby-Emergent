"""Backend tests for the new endpoints added in iteration 10:

- GET  /api/leads               (admin-gated proxy of production quotes)
- PUT  /api/admin/password      (change password, min 6 chars, DB-persist)
- POST /api/admin/login         (updated pw takes effect)
- POST /api/assignments/{id}/status (new status transitions: on_the_way / cleaning / done)
- GET  /api/cleaners/{id}/jobs  ($in filter keeps on_the_way + cleaning visible)

Password is RESTORED to the value in ADMIN_PASSWORD env at fixture teardown.
"""

import os
import uuid
import time
import pytest
import requests


BASE_URL = os.environ.get(
    "EXPO_PUBLIC_IMAGES_URL",
    "https://expo-book-cleaning.preview.emergentagent.com",
).rstrip("/")

ORIGINAL_PW = os.environ.get("ADMIN_PASSWORD", "tidyups2026")
CLEANER_PIN = "1234"


# --------------------------- fixtures ---------------------------

@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def admin_headers():
    return {"X-Admin-Password": ORIGINAL_PW, "Content-Type": "application/json"}


@pytest.fixture(autouse=True)
def _restore_pw():
    """Guarantee admin password is back to the env value after every test."""
    yield
    # Try the "current" pw = original; if that fails, try candidates used in tests.
    for candidate in (ORIGINAL_PW, "qatest123", "changed_pw_9x"):
        r = requests.put(
            f"{BASE_URL}/api/admin/password",
            json={"new_password": ORIGINAL_PW},
            headers={"X-Admin-Password": candidate, "Content-Type": "application/json"},
        )
        if r.status_code == 200:
            return
    # If we still can't restore, fail loudly so the human notices.
    pytest.fail(f"Could not restore admin password to {ORIGINAL_PW!r}")


@pytest.fixture
def seed_cleaner(api):
    name = f"TEST_Status_{uuid.uuid4().hex[:6]}"
    r = api.post(f"{BASE_URL}/api/cleaners/checkin",
                 json={"name": name, "pin": CLEANER_PIN})
    assert r.status_code == 200
    body = r.json()
    yield {"id": body["cleaner_id"], "name": body["name"], "pin": CLEANER_PIN}
    try:
        requests.delete(f"{BASE_URL}/api/cleaners/{body['cleaner_id']}",
                        headers={"X-Admin-Password": ORIGINAL_PW})
    except Exception:
        pass


def _mk_payload(cleaner_id):
    return {
        "quote_id": f"TEST_status_quote_{uuid.uuid4().hex[:8]}",
        "cleaner_id": cleaner_id,
        "customer_name": "TEST_StatusFlow",
        "service_type": "Standard Clean",
        "address": "1 TEST Ave",
        "phone": "204-555-0199",
        "preferred_date": "2026-02-01",
        "message": "TEST_ status flow",
    }


# --------------------------- GET /api/leads ---------------------------

class TestLeadsProxy:
    def test_requires_admin(self, api):
        r = api.get(f"{BASE_URL}/api/leads")
        assert r.status_code == 401

    def test_wrong_pw_401(self, api):
        r = api.get(f"{BASE_URL}/api/leads",
                    headers={"X-Admin-Password": "wrong"})
        assert r.status_code == 401

    def test_returns_list_of_leads(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/leads", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # Production has real leads — at least verify shape when non-empty
        if data:
            lead = data[0]
            assert "id" in lead
            assert "name" in lead or "customer_name" in lead
            assert "_id" not in lead


# --------------------------- PUT /api/admin/password ---------------------------

class TestAdminPasswordChange:
    def test_requires_current_pw(self, api):
        r = api.put(f"{BASE_URL}/api/admin/password",
                    json={"new_password": "abcdef"})
        assert r.status_code == 401

    def test_wrong_current_pw(self, api):
        r = api.put(f"{BASE_URL}/api/admin/password",
                    json={"new_password": "abcdef"},
                    headers={"X-Admin-Password": "bad"})
        assert r.status_code == 401

    def test_too_short(self, api, admin_headers):
        r = api.put(f"{BASE_URL}/api/admin/password",
                    json={"new_password": "abc"},
                    headers=admin_headers)
        assert r.status_code == 400

    def test_change_and_login_lifecycle(self, api, admin_headers):
        new_pw = "qatest123"
        # change
        r = api.put(f"{BASE_URL}/api/admin/password",
                    json={"new_password": new_pw},
                    headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Old pw fails on login
        old_login = api.post(f"{BASE_URL}/api/admin/login",
                             headers={"X-Admin-Password": ORIGINAL_PW})
        assert old_login.status_code == 401

        # New pw works on login
        new_login = api.post(f"{BASE_URL}/api/admin/login",
                             headers={"X-Admin-Password": new_pw})
        assert new_login.status_code == 200

        # New pw also works on /leads (integration check)
        leads = api.get(f"{BASE_URL}/api/leads",
                       headers={"X-Admin-Password": new_pw})
        assert leads.status_code == 200

        # Old pw denied on /leads
        leads_old = api.get(f"{BASE_URL}/api/leads",
                           headers={"X-Admin-Password": ORIGINAL_PW})
        assert leads_old.status_code == 401
        # (autouse fixture restores password)


# --------------------------- POST /assignments/{id}/status ---------------------------

class TestAssignmentStatus:
    def _create(self, api, admin_headers, cleaner_id):
        r = api.post(f"{BASE_URL}/api/assignments",
                     json=_mk_payload(cleaner_id),
                     headers=admin_headers)
        assert r.status_code == 200, r.text
        return r.json()

    def test_invalid_status_400(self, api, admin_headers, seed_cleaner):
        a = self._create(api, admin_headers, seed_cleaner["id"])
        try:
            r = api.post(f"{BASE_URL}/api/assignments/{a['id']}/status",
                         json={"cleaner_id": seed_cleaner["id"],
                               "pin": CLEANER_PIN,
                               "status": "eating_lunch"})
            assert r.status_code == 400
        finally:
            requests.delete(f"{BASE_URL}/api/assignments/{a['id']}",
                            headers={"X-Admin-Password": ORIGINAL_PW})

    def test_wrong_cleaner_id_404(self, api, admin_headers, seed_cleaner):
        a = self._create(api, admin_headers, seed_cleaner["id"])
        try:
            r = api.post(f"{BASE_URL}/api/assignments/{a['id']}/status",
                         json={"cleaner_id": "not-this-cleaner",
                               "pin": CLEANER_PIN,
                               "status": "on_the_way"})
            assert r.status_code == 404
        finally:
            requests.delete(f"{BASE_URL}/api/assignments/{a['id']}",
                            headers={"X-Admin-Password": ORIGINAL_PW})

    def test_on_the_way_and_cleaning_keep_job_visible(self, api, admin_headers, seed_cleaner):
        a = self._create(api, admin_headers, seed_cleaner["id"])
        try:
            # on_the_way
            r = api.post(f"{BASE_URL}/api/assignments/{a['id']}/status",
                         json={"cleaner_id": seed_cleaner["id"],
                               "pin": CLEANER_PIN,
                               "status": "on_the_way"})
            assert r.status_code == 200
            assert r.json()["status"] == "on_the_way"

            jobs = api.get(f"{BASE_URL}/api/cleaners/{seed_cleaner['id']}/jobs",
                           headers={"X-Cleaner-Pin": CLEANER_PIN})
            assert jobs.status_code == 200
            job_ids = [j["id"] for j in jobs.json()]
            assert a["id"] in job_ids
            statuses = {j["id"]: j["status"] for j in jobs.json()}
            assert statuses[a["id"]] == "on_the_way"

            # admin list also has status_updated_at now
            admin_list = api.get(f"{BASE_URL}/api/assignments",
                                 headers={"X-Admin-Password": ORIGINAL_PW}).json()
            row = next(x for x in admin_list if x["id"] == a["id"])
            assert row["status"] == "on_the_way"
            assert row["status_updated_at"] is not None

            # cleaning
            r2 = api.post(f"{BASE_URL}/api/assignments/{a['id']}/status",
                          json={"cleaner_id": seed_cleaner["id"],
                                "pin": CLEANER_PIN,
                                "status": "cleaning"})
            assert r2.status_code == 200
            jobs2 = api.get(f"{BASE_URL}/api/cleaners/{seed_cleaner['id']}/jobs",
                            headers={"X-Cleaner-Pin": CLEANER_PIN}).json()
            assert any(j["id"] == a["id"] and j["status"] == "cleaning" for j in jobs2)
        finally:
            requests.delete(f"{BASE_URL}/api/assignments/{a['id']}",
                            headers={"X-Admin-Password": ORIGINAL_PW})

    def test_done_removes_from_cleaner_jobs_and_sets_completed_at(
            self, api, admin_headers, seed_cleaner):
        a = self._create(api, admin_headers, seed_cleaner["id"])
        try:
            r = api.post(f"{BASE_URL}/api/assignments/{a['id']}/status",
                         json={"cleaner_id": seed_cleaner["id"],
                               "pin": CLEANER_PIN,
                               "status": "done"})
            assert r.status_code == 200
            jobs = api.get(f"{BASE_URL}/api/cleaners/{seed_cleaner['id']}/jobs",
                           headers={"X-Cleaner-Pin": CLEANER_PIN}).json()
            assert not any(j["id"] == a["id"] for j in jobs)

            admin_list = api.get(f"{BASE_URL}/api/assignments",
                                 headers={"X-Admin-Password": ORIGINAL_PW}).json()
            row = next(x for x in admin_list if x["id"] == a["id"])
            assert row["status"] == "done"
            assert row["completed_at"] is not None
            assert row["status_updated_at"] is not None
        finally:
            requests.delete(f"{BASE_URL}/api/assignments/{a['id']}",
                            headers={"X-Admin-Password": ORIGINAL_PW})

    def test_status_done_endpoint(self, api, admin_headers, seed_cleaner):
        a = self._create(api, admin_headers, seed_cleaner["id"])
        try:
            r = api.post(f"{BASE_URL}/api/assignments/{a['id']}/status",
                         json={"cleaner_id": seed_cleaner["id"], "pin": CLEANER_PIN, "status": "done"})
            assert r.status_code == 200
            admin_list = api.get(f"{BASE_URL}/api/assignments",
                                 headers={"X-Admin-Password": ORIGINAL_PW}).json()
            row = next(x for x in admin_list if x["id"] == a["id"])
            assert row["status"] == "done"
        finally:
            requests.delete(f"{BASE_URL}/api/assignments/{a['id']}",
                            headers={"X-Admin-Password": ORIGINAL_PW})
