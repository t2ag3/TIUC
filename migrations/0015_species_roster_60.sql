-- キャラ図鑑を100種類まで拡張する第一弾（60種）。
-- 新方針：基本種はすべてrarity=1（★1）で入手し、合成（★1→★2→★3）でランクを上げる。
-- ★4は合成では手に入らない個別の特別キャラ専用（mysteryが最初の例）。
-- そのためold white_eye/kingfisherの「種族固定レア度」は廃止する。
-- 本番ユーザーデータはテスト用のみ（実ユーザー無し）で破壊的変更OKとの指示のもと実施
-- （ユーザー指示、2026-08-27）。

-- 旧white_eyeは新リストのwhite_eye_birdに統合するため削除。
DELETE FROM character_drops WHERE species_id = 'white_eye';
DELETE FROM user_characters WHERE species_id = 'white_eye';
DELETE FROM species WHERE id = 'white_eye';

-- kingfisherはidそのまま、レア度だけ新モデルに合わせて1に変更（既存所持データは維持）。
UPDATE species SET rarity = 1, sort_order = 45 WHERE id = 'kingfisher';
UPDATE species SET sort_order = 55 WHERE id = 'sparrow';
-- mysteryは特別枠として図鑑の最後に表示する。
UPDATE species SET sort_order = 61 WHERE id = 'mystery';

INSERT INTO species (id, name_key, rarity, sort_order) VALUES
  ('long_tailed_tit', 'long_tailed_tit', 1, 1),
  ('Pallas_cat', 'Pallas_cat', 1, 2),
  ('axolotl', 'axolotl', 1, 3),
  ('red_panda', 'red_panda', 1, 4),
  ('T_rex', 'T_rex', 1, 5),
  ('Sacabambaspis', 'Sacabambaspis', 1, 6),
  ('quokka', 'quokka', 1, 7),
  ('naked_mole_rat', 'naked_mole_rat', 1, 8),
  ('aye_aye', 'aye_aye', 1, 9),
  ('fangtooth', 'fangtooth', 1, 10),
  ('anglerfish', 'anglerfish', 1, 11),
  ('flapjack_octopus', 'flapjack_octopus', 1, 12),
  ('oarfish', 'oarfish', 1, 13),
  ('paddlefish', 'paddlefish', 1, 14),
  ('giant_isopod', 'giant_isopod', 1, 15),
  ('vampire_squid', 'vampire_squid', 1, 16),
  ('mimic_octopus', 'mimic_octopus', 1, 17),
  ('seahorse', 'seahorse', 1, 18),
  ('ocean_sunfish', 'ocean_sunfish', 1, 19),
  ('garden_eel', 'garden_eel', 1, 20),
  ('moray_eel', 'moray_eel', 1, 21),
  ('sea_otter', 'sea_otter', 1, 22),
  ('hedgehog', 'hedgehog', 1, 23),
  ('fennec_fox', 'fennec_fox', 1, 24),
  ('shoebill', 'shoebill', 1, 25),
  ('penguin_chick', 'penguin_chick', 1, 26),
  ('small_clawed_otter', 'small_clawed_otter', 1, 27),
  ('hamster', 'hamster', 1, 28),
  ('flying_squirrel', 'flying_squirrel', 1, 29),
  ('sloth', 'sloth', 1, 30),
  ('capybara', 'capybara', 1, 31),
  ('alpaca', 'alpaca', 1, 32),
  ('echidna', 'echidna', 1, 33),
  ('platypus', 'platypus', 1, 34),
  ('wombat', 'wombat', 1, 35),
  ('koala', 'koala', 1, 36),
  ('raccoon', 'raccoon', 1, 37),
  ('tanuki', 'tanuki', 1, 38),
  ('fox', 'fox', 1, 39),
  ('shiba_inu', 'shiba_inu', 1, 40),
  ('owl', 'owl', 1, 41),
  ('cockatiel', 'cockatiel', 1, 42),
  ('java_sparrow', 'java_sparrow', 1, 43),
  ('pigeon', 'pigeon', 1, 44),
  ('pelican', 'pelican', 1, 46),
  ('flamingo', 'flamingo', 1, 47),
  ('ostrich', 'ostrich', 1, 48),
  ('emperor_penguin', 'emperor_penguin', 1, 49),
  ('crow', 'crow', 1, 50),
  ('chicken', 'chicken', 1, 51),
  ('duck', 'duck', 1, 52),
  ('swan', 'swan', 1, 53),
  ('swallow', 'swallow', 1, 54),
  ('white_eye_bird', 'white_eye_bird', 1, 56),
  ('kiwi_bird', 'kiwi_bird', 1, 57),
  ('hummingbird', 'hummingbird', 1, 58),
  ('macaw', 'macaw', 1, 59),
  ('emperor_penguin_chick', 'emperor_penguin_chick', 1, 60);
