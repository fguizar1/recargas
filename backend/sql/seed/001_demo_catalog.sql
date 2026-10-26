BEGIN;

INSERT INTO carriers (code, name)
VALUES
  ('telcel', 'Telcel'),
  ('movistar', 'Movistar'),
  ('att', 'AT&T')
ON CONFLICT (code) DO NOTHING;

INSERT INTO recharge_types (carrier_id, code, name)
SELECT c.id, types.code, types.name
FROM carriers c
CROSS JOIN (
  VALUES
    ('saldo', 'Recargas de saldo'),
    ('paquetes', 'Paquetes de demostración')
) AS types(code, name)
WHERE c.code IN ('telcel', 'movistar', 'att')
ON CONFLICT (carrier_id, code) DO NOTHING;

INSERT INTO recharge_packages (
  type_id,
  name,
  price_cents,
  validity_days,
  benefits
)
SELECT
  t.id,
  packages.name,
  packages.price_cents,
  packages.validity_days,
  packages.benefits
FROM recharge_types t
JOIN carriers c ON c.id = t.carrier_id
CROSS JOIN (
  VALUES
    ('Paquete demo básico', 5000, 7, ARRAY['Oferta ficticia de demostración']::TEXT[]),
    ('Paquete demo intermedio', 10000, 15, ARRAY['Oferta ficticia de demostración']::TEXT[]),
    ('Paquete demo avanzado', 20000, 30, ARRAY['Oferta ficticia de demostración']::TEXT[])
) AS packages(name, price_cents, validity_days, benefits)
WHERE t.code = 'paquetes'
  AND c.code IN ('telcel', 'movistar', 'att')
ON CONFLICT (type_id, name) DO NOTHING;

COMMIT;
