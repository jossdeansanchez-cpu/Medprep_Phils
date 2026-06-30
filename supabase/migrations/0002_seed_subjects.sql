-- The 12 subjects of the Philippine Physician Licensure Examination (PLE).
insert into public.subjects (name, slug, "order") values
  ('Anatomy',                              'anatomy',              1),
  ('Biochemistry',                         'biochemistry',         2),
  ('Physiology',                           'physiology',           3),
  ('Microbiology & Parasitology',          'microbiology',         4),
  ('Pathology',                            'pathology',            5),
  ('Pharmacology',                         'pharmacology',         6),
  ('Medicine',                             'medicine',             7),
  ('Surgery',                              'surgery',              8),
  ('Obstetrics & Gynecology',              'obgyne',               9),
  ('Pediatrics',                           'pediatrics',          10),
  ('Preventive Medicine & Public Health',  'preventive-medicine', 11),
  ('Legal Medicine, Ethics & Jurisprudence','legal-medicine',     12)
on conflict (slug) do nothing;
