import psycopg2
from pathlib import Path

CONN = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

sql = Path("supabase/migrations/20260721160000_district_focal_access.sql").read_text(encoding="utf-8")
conn = psycopg2.connect(CONN)
conn.autocommit = True
cur = conn.cursor()
cur.execute(sql)
cur.execute(
    """
    UPDATE profile
    SET district_id = %s,
        full_name = %s
    WHERE id = %s
    RETURNING id, role, district_id, full_name
    """,
    (
        "fd92a70d-f428-412a-b9a3-a645423d01d0",
        "District Focal — Chitral Lower",
        "3572e39e-13c9-463c-aaf3-50e5602e5a86",
    ),
)
print(cur.fetchall())
cur.close()
conn.close()
print("done")
