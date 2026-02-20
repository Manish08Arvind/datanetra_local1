-- Run this in Supabase SQL Editor to fix opportunity dashboard data.
-- 1. Set email to contact{id}@msme{business_type}.in for every company
-- 2. Ensures business_type is one of: fmcg, clothing, electronic, supermarket

-- Step 1: Update all company emails to match business type (e.g. @msmefmcg.in, @msmeclothing.in)
UPDATE msme_master
SET email = 'contact' || id || '@msme' || business_type || '.in'
WHERE business_type IN ('fmcg', 'clothing', 'electronic', 'supermarket');

-- Step 2: Fix any rows with NULL or invalid business_type (set to fmcg as default)
UPDATE msme_master
SET business_type = 'fmcg',
    email = 'contact' || id || '@msmefmcg.in'
WHERE business_type IS NULL OR business_type NOT IN ('fmcg', 'clothing', 'electronic', 'supermarket');

-- Step 3 (optional): See current count per business type
-- SELECT business_type, COUNT(*) FROM msme_master GROUP BY business_type;
