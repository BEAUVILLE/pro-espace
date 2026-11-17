"""LOC PRO WORLD10 -- protect private bookings, nightly rates and the existing Magic Link."""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ENTRY=(ROOT/"index.html").read_text(encoding="utf-8")
LOC=(ROOT/"loc.html").read_text(encoding="utf-8")
I18N=(ROOT/"loc-pro-world10.js").read_text(encoding="utf-8")

def translations():
    m=re.search(r"const rows=(\[.*\]);\nconst phrases=new Map",I18N)
    assert m,"WORLD10 LOC dictionary missing"
    return json.loads(m.group(1))

class LocProWorld10(unittest.TestCase):
    def test_10_locales_and_real_owner_pages(self):
        locales=["fr","en","es","pt","de","it","nl","ar","wo","zh"]
        self.assertIn("const langs="+json.dumps(locales,separators=(",",":")),I18N)
        rows=translations()
        self.assertGreaterEqual(len(rows),100)
        self.assertEqual(len(rows),len({r[0] for r in rows}))
        for row in rows:
            self.assertEqual(len(row),10,row[0])
            self.assertTrue(all(isinstance(x,str) and x.strip() for x in row),row[0])
        for page in (ENTRY,LOC):
            self.assertEqual(page.count('<script src="./loc-pro-world10.js" defer></script>'),1)
        for key in [
            "Calendrier propriétaire","📒 Carnet des réservations",
            "Disponible","Occupé","Fermé","🔒 Enregistrer la réservation",
            "Prix spécial / nuitée","Enregistrer le tarif de base",
            "Code reçu par email","Déconnexion","Annulée","Historique",
            "⚠️ Sélectionnez une date ou une période.","Langue"
        ]:
            self.assertIn(key,{row[0] for row in rows})
        self.assertIn("lang===\"ar\"?\"rtl\":\"ltr\"",I18N)

    def test_all_loc_owner_static_controls_localized(self):
        rows={row[0] for row in translations()}
        brand_or_data={
            "DIGIYLYFE · MASTER LOC","Booking.com","Airbnb","WhatsApp",
            "votre@email.com","78","+33… / +221…"
        }
        html=re.sub(r"<script\b[^>]*>[\s\S]*?</script>","",LOC,flags=re.I)
        html=re.sub(r"<style\b[^>]*>[\s\S]*?</style>","",html,flags=re.I)
        labels={x.strip() for x in re.sub(r"<[^>]+>","|",html).split("|")
                if len(x.strip())>2 and re.search(r"[A-Za-zÀ-ÿ]",x)}
        labels.update(re.findall(r'(?:placeholder|aria-label|title)="([^"]+)"',html))
        self.assertFalse(labels-rows-brand_or_data,sorted(labels-rows-brand_or_data))

    def test_calendar_date_format_including_day_names_is_locale_aware(self):
        self.assertIn("DIGIY_LOC_WORLD10?.locale?.()",LOC)
        self.assertIn("DIGIY_LOC_WORLD10?.weekdays?.()",LOC)
        self.assertIn("DIGIY_LOC_REFRESH_LOCALE",LOC)
        self.assertIn("render();updateSelection();syncBase();renderReservations();",LOC)

    def test_magic_link_and_return_to_owner_keep_loc_and_language(self):
        self.assertIn("shouldCreateUser:false",ENTRY)
        self.assertIn("emailRedirectTo:ownerMagicRedirect()",ENTRY)
        self.assertIn("getLang",ENTRY)
        self.assertIn("encodeURIComponent(language)",ENTRY)
        self.assertIn("module=loc&lang=",LOC)
        self.assertIn("site='+encodeURIComponent(slug)",ENTRY)
        self.assertIn("SITE_SLUG=(new URLSearchParams(location.search).get('site')",LOC)
        self.assertIn("digiy_loc_master_sites",LOC)
        self.assertIn("digiy_loc_master_units",LOC)

    def test_private_guest_data_and_rate_storage_untouched(self):
        for text in [
            "digiy_loc_master_unit_calendar","digiy_loc_master_unit_prices",
            "digiy_loc_master_list_reservations_v2",
            "digiy_loc_master_list_reservations_v1",
            "digiy_loc_master_units","saveBasePrice","applySpecialPrice",
            "saveReservation","reservationMessage"
        ]:
            self.assertIn(text,LOC)
        self.assertIn("if(el.closest(\"#siteTitle,#unitSelect,#monthLabel,#calendarGrid\"))return true",I18N)
        self.assertIn('if(el.closest("#sitesGrid strong"))return true',I18N)
        self.assertIn('if(el.closest("#reservationList"))',I18N)
        self.assertIn('if(el.closest("#digiyCoreOwner"))return true',I18N)
        for bad in ["supabase.createClient",".rpc(","fetch(","innerHTML=",".update(","upsert("]:
            self.assertNotIn(bad,I18N)

    def test_js_syntax(self):
        for name,html in [("loc-pro-world10.js",I18N)]:
            proc=subprocess.run(["node","--check","-"],input=html,text=True,capture_output=True)
            self.assertEqual(proc.returncode,0,name+": "+proc.stderr)
        for name,html in [("index",ENTRY),("loc",LOC)]:
            for attrs,js in re.findall(r"<script\b([^>]*)>([\s\S]*?)</script>",html):
                if "src=" in attrs or not js.strip():continue
                proc=subprocess.run(["node","--check","-"],input=js,text=True,capture_output=True)
                self.assertEqual(proc.returncode,0,name+": "+proc.stderr)

if __name__=="__main__":
    unittest.main()
