-- Initialize PostgreSQL database for OPC UA Dashboard
-- This script creates initial tables and demo data

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create demo factory if not exists (adjust for entity structure)
-- Note: This script needs to be updated based on actual entity structure
-- The entity uses: factoryId (PK), factoryName, factoryIndex, width, height, createdAt, user

-- Create demo machines for mock data generation  
-- Note: Machine entity uses: machineId (PK), machineName, machineIpAddress, machineIndex, status, createdAt, user, factory
-- This script serves as a template - actual implementation depends on how entities are created

-- Example for manual creation via API:
-- POST /factories with { factoryName: "Demo Factory", factoryIndex: 1, width: 100, height: 100 }
-- POST /machines with { machineName: "C01", machineIpAddress: "192.168.1.101", machineIndex: 1, status: "active" }