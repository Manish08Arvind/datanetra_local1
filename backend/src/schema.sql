-- Core tables
CREATE TABLE IF NOT EXISTS msme_master (
  id SERIAL PRIMARY KEY,
  udhayam_id VARCHAR(50) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  primary_owner VARCHAR(255),
  secondary_owner VARCHAR(255),
  gstin VARCHAR(20),
  business_type VARCHAR(50) CHECK (business_type IN ('fmcg', 'clothing', 'electronic', 'supermarket')),
  location VARCHAR(255),
  mobile_number VARCHAR(20),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS msme_signups (
  id SERIAL PRIMARY KEY,
  udhayam_id VARCHAR(50) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  owner_name VARCHAR(255) NOT NULL,
  contact_number VARCHAR(20) NOT NULL,
  msme_certificate_url TEXT,
  is_valid_master_match BOOLEAN,
  master_msme_id INT REFERENCES msme_master(id),
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS msme_users (
  id SERIAL PRIMARY KEY,
  msme_master_id INT REFERENCES msme_master(id),
  udhayam_id VARCHAR(50) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  contact_number VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  password_hash TEXT,
  role VARCHAR(20) DEFAULT 'OWNER',
  parent_company_id INT REFERENCES msme_master(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (udhayam_id, role)
);

CREATE TABLE IF NOT EXISTS msme_otps (
  id SERIAL PRIMARY KEY,
  msme_user_temp_id INT REFERENCES msme_signups(id),
  otp_code VARCHAR(10) NOT NULL,
  mobile_number VARCHAR(20) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- OTPs for MSME login (sent to registered email)
CREATE TABLE IF NOT EXISTS login_otps (
  id SERIAL PRIMARY KEY,
  udhayam_id VARCHAR(50) NOT NULL,
  otp_code VARCHAR(10) NOT NULL,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS msme_products (
  id SERIAL PRIMARY KEY,
  msme_master_id INT REFERENCES msme_master(id),
  product_name VARCHAR(255),
  category VARCHAR(100),
  unit VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS msme_trade_relations (
  id SERIAL PRIMARY KEY,
  buyer_msme_id INT REFERENCES msme_master(id),
  seller_msme_id INT REFERENCES msme_master(id),
  product_name VARCHAR(255),
  estimated_monthly_demand NUMERIC,
  estimated_monthly_value NUMERIC(18,2),
  location_match BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uploaded_datasets (
  id SERIAL PRIMARY KEY,
  msme_user_id INT REFERENCES msme_users(id),
  original_filename VARCHAR(255),
  file_url TEXT,
  schema_json JSONB,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forecast_runs (
  id SERIAL PRIMARY KEY,
  msme_user_id INT REFERENCES msme_users(id),
  dataset_id INT REFERENCES uploaded_datasets(id),
  model_name VARCHAR(255),
  parameters_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- App admins and employees (creators/staff who control the web app; not tied to Udhayam)
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'EMPLOYEE' CHECK (role IN ('ADMIN', 'EMPLOYEE')),
  created_at TIMESTAMP DEFAULT NOW()
);
-- If table already exists without role column, run: ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'EMPLOYEE'; UPDATE admin_users SET role = 'ADMIN' WHERE role IS NULL;

-- Seed dummy MSME data
INSERT INTO msme_master
(udhayam_id, company_name, primary_owner, secondary_owner, gstin, business_type, location, mobile_number, email)
VALUES
('UDH001', 'Sai FMCG Traders', 'R. Kumar', 'M. Priya', '29ABCDE1234F1Z5', 'fmcg', 'Chennai', '7358739679', 'manishsarvind@gmail.com'),
('UDH002', 'Metro Supermarket', 'S. Deepak', 'L. Rani', '29FGHIJ5678K2Z6', 'supermarket', 'Chennai', '9000011111', 'metro.supermarket@example.com'),
('UDH003', 'Comfort Clothing', 'A. Meena', 'R. Shankar', '29KLMNO9012P3Z7', 'clothing', 'Coimbatore', '9000022222', 'comfort.clothing@example.com'),
('UDH004', 'Spark Electronics', 'J. Vivek', 'S. Anitha', '29PQRST3456U4Z8', 'electronic', 'Bengaluru', '9000033333', 'spark.electronics@example.com'),
('UDH005', 'GreenFresh FMCG', 'B. Ravi', 'T. Kavya', '29UVWXY7890Z5Z9', 'fmcg', 'Madurai', '9000044444', 'greenfresh@example.com'),
('UDH006', 'Urban Wear', 'D. Nithya', 'V. Karthik', '29ABCDE5678F6Z0', 'clothing', 'Chennai', '9000055555', 'urbanwear@example.com'),
('UDH007', 'City Supermart', 'G. Arjun', 'H. Divya', '29FGHIJ9012K7Z1', 'supermarket', 'Coimbatore', '9000066666', 'city.supermart@example.com'),
('UDH008', 'Digital Hub Electronics', 'I. Sanjay', 'P. Rekha', '29KLMNO3456P8Z2', 'electronic', 'Madurai', '9000077777', 'digitalhub@example.com')
ON CONFLICT (udhayam_id) DO NOTHING;

