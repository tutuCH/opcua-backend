/**
 * Allowed SPC field names for validation.
 * Matches fields written to InfluxDB by writeSPCData().
 */
export const ALLOWED_SPC_FIELDS = [
  // Required fields (always present)
  'cycle_number',
  'cycle_time',
  'injection_velocity_max',
  'injection_pressure_max',
  'switch_pack_time',
  'temp_1',
  'temp_2',
  'temp_3',

  // Optional fields (may be present)
  'switch_pack_pressure',
  'switch_pack_position',
  'injection_time',
  'plasticizing_time',
  'plasticizing_pressure_max',
  'temp_4',
  'temp_5',
  'temp_6',
  'temp_7',
  'temp_8',
  'temp_9',
  'temp_10',
  'injection_pressure_set',
  'fill_cooling_time',
  'injection_pressure_set_min',
  'oil_temperature_cycle',
  'end_mold_open_speed',
  'injection_start_speed',
] as const;

export type AllowedSPCField = (typeof ALLOWED_SPC_FIELDS)[number];
