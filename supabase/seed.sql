-- Day 5 demo seed: channel recipient counts for ALL districts
-- (Issue → fan-out needs at least one channel row per district)
insert into channel_recipient_count (district_id, channel, recipient_count)
select d.id, c.channel, c.cnt
from district d
cross join (values
  ('sms', 2500),
  ('whatsapp', 1200),
  ('email', 200),
  ('app_push', 150),
  ('siren', 4),
  ('loudspeaker', 4)
) as c(channel, cnt)
on conflict (district_id, channel) do nothing;