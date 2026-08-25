-- ヒーロー表示用に、所持しているキャラから1体を選んで表示できるようにする。
ALTER TABLE characters ADD COLUMN display_species_id TEXT REFERENCES species(id);
