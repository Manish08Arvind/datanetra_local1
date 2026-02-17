-- =============================================================================
-- Dummy data for MSME Opportunity dashboard & supply/demand chatbot
-- Run this in Supabase SQL Editor. Dashboard already uses your Supabase DB
-- when DATABASE_URL in backend/.env points to Supabase.
-- =============================================================================

-- 1) Add 192 MSME companies (UDH009–UDH200) so total is 200 with existing 8
INSERT INTO msme_master (
  udhayam_id, company_name, primary_owner, secondary_owner, gstin,
  business_type, location, mobile_number, email
)
SELECT
  'UDH' || LPAD((8 + n)::text, 3, '0'),
  'Company ' || (8 + n),
  'Owner' || (8 + n),
  'Partner' || (8 + n),
  '29' || LPAD((8 + n)::text, 10, '0') || 'Z' || ((8 + n) % 10),
  (ARRAY['fmcg', 'clothing', 'electronic', 'supermarket'])[1 + (n % 4)],
  (ARRAY[
    'Chennai', 'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Kolkata', 'Pune', 'Ahmedabad',
    'Coimbatore', 'Madurai', 'Kochi', 'Jaipur', 'Lucknow', 'Nagpur', 'Indore', 'Bhopal',
    'Surat', 'Vadodara', 'Ludhiana', 'Chandigarh', 'Guwahati', 'Thiruvananthapuram',
    'Visakhapatnam', 'Bhubaneswar', 'Ranchi', 'Mysuru', 'Mangaluru', 'Tiruchirappalli'
  ])[1 + (n % 28)],
  '9' || LPAD((100000000 + (n * 1234567) % 900000000)::text, 9, '0'),
  'contact' || (8 + n) || '@msme.in'
FROM generate_series(1, 192) AS n
ON CONFLICT (udhayam_id) DO NOTHING;

-- 2) Add trade relations for dashboard "Buy from" / "Sell to" and chatbot
INSERT INTO msme_trade_relations (
  buyer_msme_id, seller_msme_id, product_name,
  estimated_monthly_demand, estimated_monthly_value, location_match
)
SELECT
  a.id,
  b.id,
  (ARRAY[
    'Packaged Snacks', 'Beverages', 'Wheat Flour', 'Rice', 'Cooking Oil', 'Pulses', 'Spices',
    'Personal Care', 'Dairy', 'Biscuits', 'Cotton Fabric', 'Readymade Garments', 'Textiles',
    'Sarees', 'Shirts', 'POS Systems', 'LED Displays', 'Cables', 'Batteries', 'Power Banks',
    'Groceries', 'FMCG Supplies', 'Fresh Produce', 'Household Items', 'Uniforms', 'Electronics'
  ])[1 + ((a.id + b.id) % 26)],
  (100 + (a.id * 7 + b.id * 11) % 4900)::numeric,
  (5000 + (a.id * 13 + b.id * 17) % 195000)::numeric,
  (a.location = b.location)
FROM msme_master a
CROSS JOIN msme_master b
WHERE a.id < b.id
  AND a.id BETWEEN 1 AND 200
  AND b.id BETWEEN 1 AND 200
ORDER BY random()
LIMIT 350;
