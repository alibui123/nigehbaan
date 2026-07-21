-- district_focal access: acknowledge deliveries + enter manual readings for own district

-- 1. alert_delivery UPDATE — provincial ops OR district_focal for their district
DROP POLICY IF EXISTS "alert_delivery_update" ON public.alert_delivery;
CREATE POLICY "alert_delivery_update" ON public.alert_delivery
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profile
    WHERE profile.id = auth.uid()
      AND (
        profile.role IN ('duty_officer', 'dg')
        OR (
          profile.role = 'district_focal'
          AND profile.district_id IS NOT NULL
          AND profile.district_id = alert_delivery.district_id
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profile
    WHERE profile.id = auth.uid()
      AND (
        profile.role IN ('duty_officer', 'dg')
        OR (
          profile.role = 'district_focal'
          AND profile.district_id IS NOT NULL
          AND profile.district_id = alert_delivery.district_id
        )
      )
  )
);

-- 2. manual_reading INSERT — allow district_focal for own district
DROP POLICY IF EXISTS "duty officers and dg can enter manual readings" ON public.manual_reading;
CREATE POLICY "staff and district_focal can enter manual readings" ON public.manual_reading
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profile
    WHERE profile.id = auth.uid()
      AND (
        profile.role IN ('duty_officer', 'dg')
        OR (
          profile.role = 'district_focal'
          AND profile.district_id IS NOT NULL
          AND profile.district_id = manual_reading.district_id
        )
      )
  )
);
