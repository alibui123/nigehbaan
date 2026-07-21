import psycopg2
from pathlib import Path

CONN = "postgresql://postgres.ksdcjwpbusadklpdwfsz:testnigheban@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
sql = Path("supabase/migrations/20260721170000_seed_all_district_channel_counts.sql").read_text(encoding="utf-8")
conn = psycopg2.connect(CONN)
conn.autocommit = True
cur = conn.cursor()
cur.execute(sql)
cur.execute("SELECT COUNT(DISTINCT district_id) FROM channel_recipient_count")
print("districts with counts:", cur.fetchone()[0])
cur.close()
conn.close()
