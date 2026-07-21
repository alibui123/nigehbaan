-- Seed demo channel recipient counts for every district (MVP dissemination board).
-- Previously only Chitral Lower / Swat / Hunza / Kohistan Lower were seeded,
-- which caused "Issue alert" to fail on other districts.

INSERT INTO public.channel_recipient_count (district_id, channel, recipient_count, is_demo_data)
SELECT d.id, c.channel, c.cnt, true
FROM public.district d
CROSS JOIN (
  VALUES
    ('sms', 2500),
    ('whatsapp', 1200),
    ('email', 200),
    ('app_push', 150),
    ('siren', 4),
    ('loudspeaker', 4)
) AS c(channel, cnt)
ON CONFLICT (district_id, channel) DO NOTHING;
