import collections
import json
import importlib.util
import re
import sqlite3
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build", ROOT / "tools/build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class LocalizationTests(unittest.TestCase):
    def database(self):
        db = sqlite3.connect(":memory:")
        schema = build.DEFAULT_GAME / "Base/Assets/schema/localization/schema-loc-10.sql"
        if schema.exists():
            db.executescript(schema.read_text())
        else:
            db.execute("CREATE TABLE LocalizedText(Language TEXT, Tag TEXT, Text TEXT, PRIMARY KEY(Language,Tag))")
        return db

    def apply_sql(self, db):
        for path in ("functional.sql", "mechanics.sql"):
            db.executescript((ROOT / "text" / path).read_text())

    def test_manifest_only_updates_text_in_both_scopes(self):
        root = ET.parse(ROOT / "better-chinese-support.modinfo").getroot()
        ns = {"m": "ModInfo"}
        self.assertEqual(root.attrib["id"], "civ7-better-chinese-support")
        groups = root.findall("m:ActionGroups/m:ActionGroup", ns)
        self.assertEqual({g.attrib["scope"] for g in groups}, {"shell", "game"})
        for group in groups:
            actions = group.find("m:Actions", ns)
            self.assertEqual([a.tag for a in actions], ["{ModInfo}UpdateText"])
            for node in actions.iter("{ModInfo}Item"):
                path = ROOT / node.text
                self.assertTrue(path.is_file(), path)
                if path.suffix == ".xml":
                    ET.parse(path)

    def test_metadata_and_only_functional_payloads(self):
        root = ET.parse(ROOT / "text/metadata.xml").getroot()
        en = {n.attrib["Tag"] for n in root.findall("EnglishText/Row")}
        zh = {n.attrib["Tag"] for n in root.findall("LocalizedText/Replace")}
        self.assertEqual(en, zh)
        self.assertEqual({p.name for p in (ROOT / "text").iterdir()},
                         {"metadata.xml", "functional.sql", "mechanics.sql"})
        rules = build.read_rules()
        self.assertTrue(all(r["category"] == "勘误" and r["tag"] for r in rules))
        self.assertTrue(all(not r["tag"].endswith("_NAME") for r in rules))
        self.assertNotIn(18, {r["row"] for r in rules})  # Dhow rename excluded.
        self.assertTrue({191,192}.issubset({r["row"] for r in rules}))

    def test_non_cascading_and_exact_key_selection(self):
        rules = [dict(row=1,category="勘误",tag="T",before="甲",after="乙"),
                 dict(row=2,category="勘误",tag="T",before="乙",after="丙")]
        self.assertEqual(build.transform("T", "甲", rules)[0], "乙")
        self.assertEqual(build.transform("OTHER", "甲", rules)[0], "甲")

    @unittest.skipUnless(build.DEFAULT_GAME.exists(), "Local game assets unavailable; set CIV7_GAME_DIR")
    def test_real_assets_sql_language_guards_idempotence_and_parameters(self):
        game = build.DEFAULT_GAME
        if not game.exists():
            self.skipTest("Local game text assets unavailable")
        texts, _ = build.read_texts(game)
        for variant in range(max(map(len, texts.values()))):
            with self.subTest(variant=variant):
                self.verify_variant(texts, variant)

    @unittest.skipUnless(build.DEFAULT_GAME.exists(), "Local game assets unavailable; set CIV7_GAME_DIR")
    def test_native_importer_trimmed_source_text(self):
        texts, _ = build.read_texts(build.DEFAULT_GAME)
        self.verify_variant({k: {v.strip() for v in values} for k, values in texts.items()}, 0)

    def verify_variant(self, texts, variant):
        db = self.database()
        originals = {tag: sorted(values)[min(variant, len(values)-1)] for tag, values in texts.items()}
        db.executemany("INSERT INTO LocalizedText(Language,Tag,Text) VALUES('zh_Hans_CN',?,?)", originals.items())
        tag = "LOC_IMPROVEMENT_JINJA_SEA_DESCRIPTION"
        db.executemany("INSERT INTO LocalizedText(Language,Tag,Text) VALUES(?,?,?)", [(l, tag, "unchanged") for l in ("en_US", "zh_Hant_HK")])
        self.apply_sql(db)
        changed = dict(db.execute("SELECT Tag,Text FROM LocalizedText WHERE Language='zh_Hans_CN'"))
        for key, original in originals.items():
            self.assertEqual(collections.Counter(re.findall(r"\{[^{}]+\}", original)),
                             collections.Counter(re.findall(r"\{[^{}]+\}", changed[key])), key)
            for markup in ("B", "I", "TIP"):
                def balance(text):
                    return len(re.findall(r"\["+markup+r"(?::[^\]]*)?\]", text))-text.count("[/"+markup+"]")
                if changed[key] != original:
                    self.assertIn(balance(changed[key]), (0, balance(original)), (key, markup))
        allowed = {r["tag"] for r in build.read_rules()} | set(build.additions())
        actual = {k for k in originals if originals[k] != changed[k]}
        self.assertEqual(actual, allowed)
        self.assertEqual(len(actual), 29)
        # Names, narrative/history text, and other mods stay byte-identical.
        for key in originals.keys() - allowed:
            self.assertEqual(originals[key], changed[key], key)
        temple = changed["LOC_WONDER_BRIHADEESWARAR_TEMPLE_DESCRIPTION"]
        self.assertEqual(temple, originals["LOC_WONDER_BRIHADEESWARAR_TEMPLE_DESCRIPTION"])
        self.assertEqual(changed["LOC_WONDER_BRIHADEESWARAR_TEMPLE_TOOLTIP"], originals["LOC_WONDER_BRIHADEESWARAR_TEMPLE_TOOLTIP"])
        self.assertIn("从[TIP:LOC_PEDIA_CONCEPTS_NAVIGABLE_RIVER_TOOLTIP]可航行河流[/TIP]", temple)
        for key, expected in build.additions().items():
            self.assertEqual(changed[key], expected, key)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM LocalizedText WHERE Language!='zh_Hans_CN' AND Text='unchanged'").fetchone()[0], 2)
        before = db.total_changes
        self.apply_sql(db)
        self.assertEqual(db.total_changes, before, "Repeated loading must not accumulate replacements")
        db.execute("UPDATE LocalizedText SET Text='new official or third-party wording' WHERE Language='zh_Hans_CN' AND Tag=?", (tag,))
        self.apply_sql(db)
        self.assertEqual(db.execute("SELECT Text FROM LocalizedText WHERE Language='zh_Hans_CN' AND Tag=?", (tag,)).fetchone()[0], "new official or third-party wording")

    @unittest.skipUnless(build.DEFAULT_GAME.exists(), "Local game assets unavailable; set CIV7_GAME_DIR")
    def test_minimal_changes_preserve_original_jinja_text_and_links(self):
        texts, _ = build.read_texts(build.DEFAULT_GAME)
        for tag, revised in build.additions(texts).items():
            if "JINJA" in tag:
                original = next(iter(texts[tag])).strip()
                self.assertTrue(revised.startswith(original + "[n]"), tag)
            else:
                self.assertIn("古典时代[icon:YIELD_HAPPINESS]幸福值", revised)
                self.assertNotIn("祭坛、竞技场", revised)
                self.assertNotIn("至少1[icon:YIELD_HAPPINESS]", revised)

    def test_without_dlc_sql_does_not_create_dlc_keys(self):
        db = self.database()
        self.apply_sql(db)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM LocalizedText").fetchone()[0], 0)

    @unittest.skipUnless(build.DEFAULT_GAME.exists(), "Local game assets unavailable; set CIV7_GAME_DIR")
    def test_mechanics_match_installed_official_rules(self):
        game = build.DEFAULT_GAME
        if not game.exists():
            self.skipTest("Local gameplay assets unavailable")
        root = ET.parse(game / "DLC/heian/modules/data/constructibles.xml").getroot()
        sea = root.find("Constructibles/Row[@ConstructibleType='IMPROVEMENT_JINJA_SEA']")
        self.assertEqual(sea.attrib["AdjacentTerrain"], "TERRAIN_FLAT")
        for kind, terrains in (("SEA", {"TERRAIN_COAST"}), ("LAND", {"TERRAIN_FLAT", "TERRAIN_HILL"})):
            key = "IMPROVEMENT_JINJA_" + kind
            self.assertEqual({n.attrib["TerrainType"] for n in root.findall(f"Constructible_ValidTerrains/Row[@ConstructibleType='{key}']")}, terrains)
            self.assertEqual(root.find(f"Constructible_ValidDistricts/Row[@ConstructibleType='{key}']").attrib["DistrictType"], "DISTRICT_RURAL")
            self.assertEqual(root.find(f"Improvements/Row[@ConstructibleType='{key}']").attrib["OnePerSettlement"], "true")
        expected = {"BUILDING_ALTAR", "BUILDING_ARENA", "BUILDING_GARDEN", "BUILDING_VILLA"}
        found = set()
        for subtree in ("Base", "DLC"):
            for path in (game / subtree).rglob("*.xml"):
                if b'ANTIQUITY_HAPPINESS' in path.read_bytes():
                    data = ET.parse(path).getroot()
                    found.update(n.attrib["Type"] for n in data.findall("TypeTags/Row[@Tag='ANTIQUITY_HAPPINESS']"))
        self.assertEqual(found, expected)
        effects = ET.parse(game / "DLC/japan-korea-wonders/modules/data/constructibles-antiquity-gameeffects.xml").getroot()
        ns = {"g": "GameEffects"}
        for suffix, yield_type, amount in (("CULTURE", "YIELD_CULTURE", "2"), ("PRODUCTION", "YIELD_PRODUCTION", "1")):
            effect = effects.find(f"g:Modifier[@id='MOD_MIREUKSA_DISTRICT_HAPPINESS_ANTIQUITY_{suffix}']", ns)
            self.assertEqual(effect.attrib["collection"], "COLLECTION_CITY_PLOT_YIELDS")
            self.assertEqual(effect.attrib["effect"], "EFFECT_PLOT_ADJUST_YIELD")
            args = {n.attrib["name"]:n.text for n in effect.findall("g:Argument", ns)}
            self.assertEqual((args["YieldType"], args["Amount"]), (yield_type, amount))
            requirements = {n.attrib["name"]:n.text for n in effect.findall("g:SubjectRequirements/g:Requirement/g:Argument", ns)}
            self.assertEqual(requirements["DistrictClass"], "CITYCENTER, URBAN")
            self.assertEqual(requirements["Age"], "AGE_ANTIQUITY")
            self.assertEqual(requirements["Tag"], "ANTIQUITY_HAPPINESS")

    @unittest.skipUnless(build.DEFAULT_GAME.exists(), "Local game assets unavailable; set CIV7_GAME_DIR")
    def test_wonder_placement_conditions(self):
        game = build.DEFAULT_GAME
        root = ET.parse(game / "DLC/shawnee-tecumseh/modules/data/constructibles.xml").getroot()
        for table, column, value in (("Constructible_ValidTerrains", "TerrainType", "TERRAIN_FLAT"),
                                     ("Constructible_ValidBiomes", "BiomeType", "BIOME_GRASSLAND")):
            nodes = root.findall(f"{table}/Row[@ConstructibleType='WONDER_SERPENT_MOUND']")
            self.assertEqual({n.get(column) for n in nodes}, {value})
        root = ET.parse(game / "Base/modules/age-exploration/data/constructibles.xml").getroot()
        row = root.find("Constructibles/Row[@ConstructibleType='WONDER_BRIHADEESWARAR_TEMPLE']")
        self.assertEqual(row.get("AdjacentRiver"), "true")
        self.assertIsNone(row.get("AdjacentNavigableRiver"))
        root = ET.parse(game / "DLC/water-wonders/modules/data/constructibles-exploration.xml").getroot()
        self.assertEqual(root.find("Constructibles/Row").get("IslandSettlement"), "30")

    @unittest.skipUnless(build.DEFAULT_GAME.exists(), "Local game assets unavailable; set CIV7_GAME_DIR")
    def test_selected_effect_scopes(self):
        game = build.DEFAULT_GAME
        ns = {"g": "GameEffects"}
        def effect(file, key):
            root = ET.parse(game / file).getroot()
            return root.find(f"g:Modifier[@id='{key}']", ns)
        def arg(node, name):
            return node.find(f"g:Argument[@name='{name}']", ns).text
        root = ET.parse(game / "Base/modules/age-antiquity/data/constructibles.xml").getroot()
        wall = root.find("Constructibles/Row[@ConstructibleType='IMPROVEMENT_HAN_GREAT_WALL']")
        baray = root.find("Constructibles/Row[@ConstructibleType='IMPROVEMENT_BARAY']")
        self.assertEqual(wall.get("Cost"), baray.get("Cost"))
        self.assertEqual(wall.get("CostProgressionParam1"), "10")
        self.assertEqual(baray.get("CostProgressionParam1"), "20")
        file = "Base/modules/age-antiquity/data/civilizations-shared-gameeffects.xml"
        for key, collection in (("POP_IN_CAPITAL", "COLLECTION_PLAYER_CAPITAL_CITY"),
                                ("POP_IN_CITIES", "COLLECTION_PLAYER_CITIES"),
                                ("POP", "COLLECTION_PLAYER_CITIES")):
            node = effect(file, "TRAIT_MOD_NINE_PROVINCES_"+key+"_ON_SCIENCE_BUILDING")
            self.assertEqual(node.get("collection"), collection)
            self.assertIsNotNone(node.find("g:SubjectRequirements/g:Requirement[@type='REQUIREMENT_CITY_BUILT_TAGGED_CONSTRUCTIBLE']", ns))
        node = effect("Base/modules/age-exploration/data/civilizations-shared-gameeffects.xml", "TRAIT_MOD_ADJACENT_TO_COAST_COMBAT")
        self.assertIsNotNone(node.find("g:SubjectRequirements/g:Requirement[@type='REQUIREMENT_PLOT_ADJACENT_TO_COAST']", ns))
        node = effect("Base/modules/base-standard/data/leaders-gameeffects.xml", "HATSHEPSUT_MOD_CULTURE_FROM_RESOURCES")
        self.assertEqual(node.get("effect"), "EFFECT_PLAYER_ADJUST_YIELD_PER_UNIQUE_RESOURCE")
        node = effect("DLC/assyria/modules/data/constructibles-gameeffects.xml", "MOD_ASSYRIA_GREAT_WORKS_PRODUCTION")
        self.assertEqual(node.get("effect"), "EFFECT_CITY_ADJUST_YIELD_PER_GREAT_WORK")
        self.assertIsNone(node.find("g:Argument[@name='ObjectType']", ns))
        node = effect("Base/modules/age-exploration/data/constructibles-gameeffects.xml", "MOD_FORBIDDEN_CITY_FORTIFICATION_CULTURE")
        self.assertEqual(node.get("effect"), "EFFECT_CITY_ADJUST_CONSTRUCTIBLE_YIELD")
        self.assertEqual(node.get("collection"), "COLLECTION_OWNER")
        node = effect("Base/modules/age-modern/data/traditions-tot-gameeffects.xml", "ATTACH_MOD_CLAN_SOCIETY_FOOD_ON_FRIENDLY_SETTLEMENTS")
        self.assertEqual(node.get("collection"), "COLLECTION_PLAYER_CITIES")
        self.assertEqual(node.find("g:SubjectRequirements/g:Requirement/g:Argument[@name='MaxDistance']",ns).text, "6")


if __name__ == "__main__":
    unittest.main()
