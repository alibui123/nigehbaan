-- Fix: alert_rule_lookback(r public.alert_rule) cannot accept RECORD from FOR loops
-- ("cannot cast type record to alert_rule") — blocked all station_reading inserts.

CREATE OR REPLACE FUNCTION public.alert_rule_lookback(
  p_rate_time_window_minutes integer,
  p_rate_time_window_hours integer
)
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    CASE WHEN p_rate_time_window_minutes IS NOT NULL AND p_rate_time_window_minutes > 0
      THEN (p_rate_time_window_minutes || ' minutes')::interval END,
    CASE WHEN p_rate_time_window_hours IS NOT NULL AND p_rate_time_window_hours > 0
      THEN (p_rate_time_window_hours || ' hours')::interval END,
    interval '1 hour'
  );
$$;

CREATE OR REPLACE FUNCTION public.evaluate_station_reading_rate_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  r record;
  v_district_id uuid;
  v_current_value double precision;
  v_past_value double precision;
  v_delta double precision;
  v_geom geometry;
  v_title text;
  v_description text;
  v_window interval;
begin
  select district_id into v_district_id from station where id = NEW.station_id;

  for r in
    select * from alert_rule
    where is_active = true
      and is_rate_rule = true
      and (district_id is null or district_id = v_district_id)
  loop
    v_current_value := case r.metric_name
      when 'temperature' then NEW.temperature
      when 'water_level' then NEW.water_level
      when 'precipitation' then NEW.rainfall
      else null
    end;

    if v_current_value is null then continue; end if;

    v_window := public.alert_rule_lookback(r.rate_time_window_minutes, r.rate_time_window_hours);

    select case r.metric_name
      when 'temperature' then temperature
      when 'water_level' then water_level
      when 'precipitation' then rainfall
    end
    into v_past_value
    from station_reading
    where station_id = NEW.station_id
      and recorded_at <= NEW.recorded_at - v_window
    order by recorded_at desc
    limit 1;

    if v_past_value is null then continue; end if;

    v_delta := v_current_value - v_past_value;

    if (r.operator = '>' and v_delta > r.threshold_value)
       or (r.operator = '>=' and v_delta >= r.threshold_value)
    then
      select geom into v_geom from district where id = v_district_id;
      v_title := r.title_template;
      v_description := replace(r.description_template, '{value}', round(v_delta::numeric,2)::text);

      insert into alert_candidate (
        rule_id, district_id, metric_name, observed_value, threshold_value,
        severity, title, description, geom, starts_at, ends_at, external_id, status
      )
      values (
        r.id, v_district_id, r.metric_name, v_current_value, r.threshold_value,
        r.severity, v_title, v_description, v_geom,
        now(), now() + interval '24 hours',
        'station_rate_' || r.id::text || '_' || NEW.id::text,
        'pending'
      )
      on conflict (external_id) do nothing;
    end if;
  end loop;

  return NEW;
end;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_manual_reading_rate_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  r record;
  v_past_value numeric;
  v_delta numeric;
  v_geom geometry;
  v_title text;
  v_description text;
  v_window interval;
begin
  for r in
    select * from alert_rule
    where is_active = true
      and is_rate_rule = true
      and metric_name = NEW.reading_type
      and (district_id is null or district_id = NEW.district_id)
  loop
    v_window := public.alert_rule_lookback(r.rate_time_window_minutes, r.rate_time_window_hours);

    select value into v_past_value
    from manual_reading
    where district_id = NEW.district_id
      and reading_type = NEW.reading_type
      and entered_at <= NEW.entered_at - v_window
    order by entered_at desc
    limit 1;

    if v_past_value is null then continue; end if;

    v_delta := NEW.value - v_past_value;

    if (r.operator = '>' and v_delta > r.threshold_value)
       or (r.operator = '>=' and v_delta >= r.threshold_value)
    then
      select geom into v_geom from district where id = NEW.district_id;
      v_title := r.title_template;
      v_description := replace(r.description_template, '{value}', round(v_delta::numeric,2)::text);

      insert into alert_candidate (
        rule_id, district_id, metric_name, observed_value, threshold_value,
        severity, title, description, geom, starts_at, ends_at, external_id, status
      )
      values (
        r.id, NEW.district_id, r.metric_name, NEW.value, r.threshold_value,
        r.severity, v_title, v_description, v_geom,
        now(), now() + interval '24 hours',
        'manual_rate_' || r.id::text || '_' || NEW.id::text,
        'pending'
      )
      on conflict (external_id) do nothing;
    end if;
  end loop;

  return NEW;
end;
$$;

-- Drop old single-arg composite overload if it still exists
DROP FUNCTION IF EXISTS public.alert_rule_lookback(public.alert_rule);
