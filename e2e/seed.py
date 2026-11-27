"""Seed only the disposable smoke-test database and its checkpoint volume."""

import asyncio
import json
import os
from pathlib import Path
from uuid import uuid4

from sqlalchemy import text

from vi_api.infrastructure.database.session import Session
from vi_api.infrastructure.identity.passwords import hash_password

FIXTURE = json.loads(Path(__file__).with_name("fixture.json").read_text())


async def seed():
    password_hash = hash_password(FIXTURE["password"])
    org = FIXTURE["owner"]["workspaceId"]
    fixture = FIXTURE["program"]
    program = fixture["id"]
    job = fixture["modelJobId"]
    dataset = uuid4()
    zone = uuid4()
    async with Session.begin() as session:
        for account in (FIXTURE["owner"], FIXTURE["outsider"]):
            workspace = account["workspaceId"]
            email = account["email"]
            await session.execute(
                text("INSERT INTO organisations (id, name) VALUES (:id, :name)"),
                {"id": workspace, "name": account["workspaceName"]},
            )
            user = await session.scalar(
                text("INSERT INTO identity.users (email) VALUES (:email) RETURNING id"),
                {"email": email},
            )
            await session.execute(text("""
                INSERT INTO identity.password_credentials (user_id, email, password_hash)
                VALUES (:user, :email, :hash)
            """), {"user": user, "email": email, "hash": password_hash})
            await session.execute(text("""
                INSERT INTO identity.memberships (org_id, user_id, role)
                VALUES (:org, :user, 'owner')
            """), {"org": workspace, "user": user})

        await session.execute(text("""
            INSERT INTO training_datasets (id, org_id, part_name, inspection_note, classes)
            VALUES (:dataset, :org, 'Box label reference', '', '["Straight label"]')
        """), {"dataset": dataset, "org": org})
        await session.execute(text("""
            INSERT INTO training_jobs (id, dataset_id, dataset_revision, status, snapshot)
            VALUES (:job, :dataset, 1, 'succeeded', '{}')
        """), {"job": job, "dataset": dataset})
        await session.execute(text("""
            INSERT INTO inspection_programs (id, org_id, dataset_id, name, model_job_id)
            VALUES (:program, :org, :dataset, :name, :job)
        """), {"program": program, "org": org, "dataset": dataset, "name": fixture["name"], "job": job})
        await session.execute(text("""
            INSERT INTO inspection_zones
                (id, program_id, name, position, x1, y1, x2, y2, expected)
            VALUES (:zone, :program, 'Board', 0, 0, 0, 1, 1, '{"Straight label": 1}')
        """), {"zone": zone, "program": program})
        snapshot = {
            "revision": 1,
            "name": fixture["name"],
            "confidence": 0.5,
            "review_margin": 0.15,
            "classes": ["Straight label"],
            "defect_classes": [],
            "zones": [{
                "id": str(zone),
                "name": "Board",
                "region": {"x1": 0, "y1": 0, "x2": 1, "y2": 1},
                "expected": {"Straight label": 1},
                "critical": True,
            }],
        }
        await session.execute(text("""
            INSERT INTO inspection_program_versions (program_id, revision, model_job_id, snapshot)
            VALUES (:program, 1, :job, CAST(:snapshot AS jsonb))
        """), {"program": program, "job": job, "snapshot": json.dumps(snapshot)})
        await session.execute(text("""
            UPDATE inspection_programs SET published_revision = 1 WHERE id = :program
        """), {"program": program})

    checkpoint = Path(os.environ["VI_TRAINING_RUN_DIR"]) / org / job / "best.pt"
    checkpoint.parent.mkdir(parents=True)
    checkpoint.write_text("Test fixture. Inference never loads this checkpoint.")


asyncio.run(seed())
