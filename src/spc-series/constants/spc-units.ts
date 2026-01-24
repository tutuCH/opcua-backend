import {
  ALLOWED_SPC_FIELDS,
  AllowedSPCField,
} from '../../machines/constants/spc-fields';

export const SPC_FIELD_UNITS: Record<AllowedSPCField, string> = {
  cycle_number: 'count',
  cycle_time: 'seconds',
  injection_velocity_max: 'mm/s',
  injection_pressure_max: 'bar',
  switch_pack_time: 'seconds',
  temp_1: 'celsius',
  temp_2: 'celsius',
  temp_3: 'celsius',
  switch_pack_pressure: 'bar',
  switch_pack_position: 'mm',
  injection_time: 'seconds',
  plasticizing_time: 'seconds',
  plasticizing_pressure_max: 'bar',
  temp_4: 'celsius',
  temp_5: 'celsius',
  temp_6: 'celsius',
  temp_7: 'celsius',
  temp_8: 'celsius',
  temp_9: 'celsius',
  temp_10: 'celsius',
  injection_pressure_set: 'bar',
  fill_cooling_time: 'seconds',
  injection_pressure_set_min: 'bar',
  oil_temperature_cycle: 'celsius',
  end_mold_open_speed: 'mm/s',
  injection_start_speed: 'mm/s',
};

export const SPC_FIELDS = ALLOWED_SPC_FIELDS;
