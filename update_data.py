#!/usr/bin/env python3
"""
VBA2 Data Updater
=================
Fetches a fresh occurrence download from GBIF, then rebuilds both web apps:

  1. vba2_species_map.html        — priority-block species richness map
  2. vt_survey_block_checklist.html — all-block checklist tool (1180 blocks)

Usage:
    python update_data.py

Credentials are read from environment variables:
    GBIF_USER     — your GBIF username
    GBIF_PASSWORD — your GBIF password
    GBIF_EMAIL    — email for GBIF download notification

Or the script will prompt interactively if not set.

Requirements:
    pip install requests shapely
"""

import os, sys, time, json, csv, re, zipfile, tempfile, getpass, subprocess
from pathlib import Path
from collections import defaultdict
import xml.etree.ElementTree as ET

# ── Auto-install dependencies ─────────────────────────────────────
def ensure_package(import_name, pip_name=None):
    pip_name = pip_name or import_name
    try:
        __import__(import_name)
    except ImportError:
        print(f"Installing {pip_name}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name, "-q"])
        print(f"  {pip_name} installed.")

ensure_package("requests")
ensure_package("shapely")

import requests
from shapely.geometry import Point, Polygon

# ── Paths ──────────────────────────────────────────────────────────
HERE             = Path(__file__).parent
OCC_FILE         = HERE / "occurrence-VBA2-2.txt"
TAXON_FILE       = HERE / "taxon.csv"
VERN_FILE        = HERE / "vernacularName.csv"
MASTER_FILE      = HERE / "species_master.json"
PRIORITY_KML     = HERE / "priorityblocks04.kml"   # 184 priority blocks
ALL_BLOCKS_KML   = HERE / "vtblocks.kml"            # all 1180 blocks
SPECIES_MAP_HTML = HERE / "vba2_species_map-archived.html"   # legacy priority-only map
CHECKLIST_HTML   = HERE / "vba2_species_map.html"             # current full-state map

# ── GBIF download predicate ────────────────────────────────────────
PREDICATE = {
    "type": "and",
    "predicates": [
        {
            "type": "or",
            "predicates": [
                {
                    "type": "and",
                    "predicates": [
                        {"type": "equals", "key": "GADM_GID",   "value": "USA.46_1", "matchCase": False},
                        {"type": "in",     "key": "TAXON_KEY",
                         "values": ["6953","5473","7017","9417","5481"], "matchCase": False}
                    ]
                },
                {
                    "type": "and",
                    "predicates": [
                        {"type": "equals", "key": "COUNTRY",        "value": "US",      "matchCase": False},
                        {"type": "in",     "key": "STATE_PROVINCE",
                         "values": ["Vermont","vermont","Vermont (state)"], "matchCase": False},
                        {"type": "equals", "key": "HAS_COORDINATE", "value": "false",   "matchCase": False},
                        {"type": "in",     "key": "TAXON_KEY",
                         "values": ["6953","5473","7017","9417","5481"], "matchCase": False}
                    ]
                }
            ]
        },
        {
            "type": "and",
            "predicates": [
                {"type": "greaterThanOrEquals", "key": "YEAR", "value": "2023", "matchCase": False},
                {"type": "lessThanOrEquals",    "key": "YEAR", "value": "2026", "matchCase": False}
            ]
        }
    ]
}

GBIF_API    = "https://api.gbif.org/v1"
INAT_DATASET = "50c9509d-22c7-4a22-a47d-8c48425ef4a7"   # iNaturalist Research-grade on GBIF

# ══════════════════════════════════════════════════════════════════
# Step 1: Credentials
# ══════════════════════════════════════════════════════════════════
def get_inat_pub_date():
    """Fetch iNaturalist dataset publication date from GBIF dataset API."""
    try:
        r = requests.get(f"{GBIF_API}/dataset/{INAT_DATASET}", timeout=15)
        r.raise_for_status()
        desc = r.json().get("description", "")
        m = re.search(r"Created on or before (\d{4}-\d{2}-\d{2})", desc)
        if m:
            return m.group(1)
    except Exception as e:
        print(f"  WARNING: Could not fetch iNaturalist publication date: {e}")
    from datetime import date
    return date.today().isoformat()   # fallback

def get_credentials():
    user  = os.environ.get("GBIF_USER")     or input("GBIF username: ").strip()
    pwd   = os.environ.get("GBIF_PASSWORD") or getpass.getpass("GBIF password: ")
    email = os.environ.get("GBIF_EMAIL")    or input("GBIF notification email: ").strip()
    return user, pwd, email

# ══════════════════════════════════════════════════════════════════
# Step 2: Submit download request
# ══════════════════════════════════════════════════════════════════
def submit_download(user, pwd, email):
    payload = {
        "creator":              user,
        "notification_address": [email],
        "sendNotification":     True,
        "format":               "DWCA",
        "predicate":            PREDICATE
    }
    print("Submitting download request to GBIF...")
    r = requests.post(
        f"{GBIF_API}/occurrence/download/request",
        json=payload, auth=(user, pwd), timeout=30
    )
    if r.status_code == 201:
        key = r.text.strip().strip('"')
        print(f"  Download key: {key}")
        return key
    else:
        sys.exit(f"Download request failed: {r.status_code} — {r.text[:300]}")

# ══════════════════════════════════════════════════════════════════
# Step 3: Poll until ready
# ══════════════════════════════════════════════════════════════════
def wait_for_download(key, poll_interval=20):
    print("Waiting for GBIF to prepare the download", end="", flush=True)
    while True:
        r = requests.get(f"{GBIF_API}/occurrence/download/{key}", timeout=30)
        r.raise_for_status()
        info   = r.json()
        status = info.get("status", "")
        if status == "SUCCEEDED":
            size_mb = info.get("size", 0) / 1_048_576
            count   = info.get("totalRecords", "?")
            print(f"\n  Ready — {count} records, {size_mb:.1f} MB")
            return info["downloadLink"]
        elif status in ("FAILED", "KILLED", "CANCELLED"):
            sys.exit(f"\nDownload {status}: {info}")
        else:
            print(".", end="", flush=True)
            time.sleep(poll_interval)

# ══════════════════════════════════════════════════════════════════
# Step 4: Download and extract occurrence file
# ══════════════════════════════════════════════════════════════════
def download_and_extract(url, user, pwd):
    print("Downloading from GBIF...")
    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = Path(tmpdir) / "download.zip"
        with requests.get(url, auth=(user, pwd), stream=True, timeout=120) as r:
            r.raise_for_status()
            total = int(r.headers.get("content-length", 0))
            done  = 0
            with open(zip_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=1_048_576):
                    f.write(chunk)
                    done += len(chunk)
                    if total:
                        print(f"\r  {done/total*100:.0f}%  ({done/1_048_576:.1f} MB)",
                              end="", flush=True)
        print()

        print("  Extracting occurrence file...")
        with zipfile.ZipFile(zip_path) as zf:
            names    = zf.namelist()
            occ_name = next(
                (n for n in names if n.lower() == "occurrence.txt"),
                next((n for n in names if n.endswith(".txt") and "occurrence" in n.lower()), None)
            )
            if not occ_name:
                sys.exit(f"Could not find occurrence.txt in zip. Contents: {names}")
            zf.extract(occ_name, tmpdir)
            extracted = Path(tmpdir) / occ_name
            n_lines   = sum(1 for _ in open(extracted, encoding="utf-8")) - 1
            print(f"  {n_lines:,} occurrence records")
            import shutil
            shutil.copy(extracted, OCC_FILE)
            print(f"  Saved → {OCC_FILE.name}")

    return n_lines

# ══════════════════════════════════════════════════════════════════
# Shared helpers: load taxonomy + common names (used by both rebuilds)
# ══════════════════════════════════════════════════════════════════
def load_taxonomy():
    """Return (taxon_lookup, synonym_genus_map, sci_to_common)."""
    vernacular = {}
    with open(VERN_FILE, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tid  = row["id"].strip()
            name = row["vernacularName"].strip()
            if row["isPreferredName"].strip().upper() == "TRUE" or tid not in vernacular:
                vernacular[tid] = name

    with open(TAXON_FILE, newline="", encoding="utf-8") as f:
        taxon_rows = list(csv.DictReader(f))

    taxon_lookup = {}; synonym_genus_map = {}; sci_to_id = {}

    for row in taxon_rows:
        rank=row["taxonRank"].strip(); status=row["taxonomicStatus"].strip()
        genus=row["genus"].strip();    epithet=row["specificEpithet"].strip()
        ap=row["acceptedNameUsage"].strip().split()
        sp=f"{ap[0]} {ap[1]}" if len(ap)>=2 else None
        if not genus or not epithet: continue
        key=(genus.lower(), epithet.lower())
        if status=="accepted" and rank=="subspecies":
            if sp: taxon_lookup[key]=sp
        elif status in ("synonym","misapplied","invalid"):
            if sp: taxon_lookup[key]=sp
            ag=ap[0] if ap else ""
            if genus.lower()!=ag.lower(): synonym_genus_map[genus.lower()]=ag.lower()

    for row in taxon_rows:
        rank=row["taxonRank"].strip(); status=row["taxonomicStatus"].strip()
        genus=row["genus"].strip();    epithet=row["specificEpithet"].strip()
        sci=row["scientificName"].strip(); tid=row["taxonID"].strip()
        if status=="accepted" and rank=="species":
            sci_to_id[sci]=tid
            if genus and epithet:
                taxon_lookup[(genus.lower(), epithet.lower())]=sci

    sci_to_common = {sci: vernacular[tid]
                     for sci, tid in sci_to_id.items() if tid in vernacular}
    return taxon_lookup, synonym_genus_map, sci_to_common


def assign_occurrences(blocks, block_key, taxon_lookup, synonym_genus_map):
    """
    Stream through OCC_FILE and assign each record to a block.
    block_key: lambda b -> the dict key to use (e.g. b['neblock'] or b['blockid'])
    Returns (block_species, block_genus_only) as defaultdict(set).
    """
    block_species    = defaultdict(set)
    block_genus_only = defaultdict(set)

    def resolve(genus, epithet):
        key=(genus.lower(), epithet.lower())
        if key in taxon_lookup: return taxon_lookup[key]
        ag=synonym_genus_map.get(genus.lower())
        if ag:
            k2=(ag, epithet.lower())
            if k2 in taxon_lookup: return taxon_lookup[k2]
            return f"{ag.capitalize()} {epithet}"
        return f"{genus} {epithet}"

    with open(OCC_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for i, row in enumerate(reader):
            if i % 5000 == 0:
                print(f"  row {i:,} ...", end="\r", flush=True)
            try:
                lat=float(row["decimalLatitude"]); lon=float(row["decimalLongitude"])
            except (ValueError, KeyError):
                continue
            rank    = row.get("taxonRank","").strip().upper()
            genus   = row.get("genus","").strip()
            epithet = row.get("specificEpithet","").strip()
            if rank=="FAMILY" or not genus: continue

            pt = Point(lon, lat); assigned = None
            for b in blocks:
                mn,ms,mx,my=b["bounds"]
                if mn<=lon<=mx and ms<=lat<=my:
                    if b["polygon"].contains(pt):
                        assigned=block_key(b); break
            if assigned is None: continue

            if rank=="GENUS":
                canonical=synonym_genus_map.get(genus.lower(), genus.lower())
                block_genus_only[assigned].add(canonical)
            elif rank in ("SPECIES","SUBSPECIES") and epithet:
                block_species[assigned].add(resolve(genus, epithet))

    print()
    return block_species, block_genus_only


# ══════════════════════════════════════════════════════════════════
# Step 5a: Rebuild GeoJSON for vba2_species_map (priority blocks)
# ══════════════════════════════════════════════════════════════════
def rebuild_priority_geojson(taxon_lookup, synonym_genus_map, sci_to_common):
    print("Rebuilding priority-block species counts (vba2_species_map)...")

    def fmt(sci):
        c=sci_to_common.get(sci); return f"{c} ({sci})" if c else sci

    # Parse priorityblocks04.kml (uses <Data>/<value> schema)
    tree=ET.parse(PRIORITY_KML); root=tree.getroot()
    ns={"kml":"http://www.opengis.net/kml/2.2"}
    blocks=[]
    for pm in root.findall(".//kml:Placemark",ns):
        ed=pm.find("kml:ExtendedData",ns)
        if ed is None: continue
        data={d.get("name"):d.find("kml:value",ns).text
              for d in ed.findall("kml:Data",ns) if d.find("kml:value",ns) is not None}
        coords_el=pm.find(".//kml:coordinates",ns)
        if coords_el is None or not coords_el.text: continue
        pairs=[]
        for t in coords_el.text.strip().split():
            p=t.split(",")
            if len(p)>=2:
                try: pairs.append((float(p[0]),float(p[1])))
                except: pass
        if len(pairs)<3: continue
        poly=Polygon(pairs)
        blocks.append({"neblock":data.get("NEBLOCK",""),"blockname":data.get("BLOCKNAME",""),
                        "polygon":poly,"bounds":poly.bounds,"centroid":poly.centroid,"pairs":pairs})

    block_species, block_genus_only = assign_occurrences(
        blocks, lambda b: b["neblock"], taxon_lookup, synonym_genus_map)

    features=[]
    for b in blocks:
        nb=b["neblock"]; sp=set(block_species.get(nb,set()))
        genera_in={s.split()[0].lower() for s in sp if s.split()}
        extra=block_genus_only.get(nb,set())-genera_in
        b["count"]=len(sp)+len(extra)
        b["species_list"]=sorted([fmt(s) for s in sp], key=str.lower)
        b["genus_only"]=sorted([g.capitalize()+" sp." for g in extra])
        ring=[[p[0],p[1]] for p in b["pairs"]]
        features.append({"type":"Feature",
            "geometry":{"type":"Polygon","coordinates":[ring]},
            "properties":{"neblock":nb,"blockname":b["blockname"],
                          "count":b["count"],"species":b["species_list"],
                          "genus_only":b["genus_only"]}})

    counts=[b["count"] for b in blocks]
    print(f"  Blocks with data: {sum(1 for c in counts if c>0)}")
    print(f"  ≥40: {sum(1 for c in counts if c>=40)}  "
          f"30-39: {sum(1 for c in counts if 30<=c<40)}  "
          f"20-29: {sum(1 for c in counts if 20<=c<30)}  "
          f"<20: {sum(1 for c in counts if 0<c<20)}")
    return {"type":"FeatureCollection","features":features}


# ══════════════════════════════════════════════════════════════════
# Step 5b: Rebuild GeoJSON for vt_survey_block_checklist (all 1180)
# ══════════════════════════════════════════════════════════════════
def rebuild_all_blocks_geojson(taxon_lookup, synonym_genus_map, sci_to_common):
    print("Rebuilding all-block species counts (vt_survey_block_checklist)...")

    def fmt(sci):
        c=sci_to_common.get(sci); return f"{c} ({sci})" if c else sci

    # Build genus → common group name from species_master.json
    genus_group = {}
    if MASTER_FILE.exists():
        with open(MASTER_FILE) as f:
            master = json.load(f)
        # Pelham order for sorting species later
        pelham_order = {sp["sci"]: i for i, sp in enumerate(master)}
        for sp in master:
            g = sp["sci"].split()[0].lower()
            words = sp.get("common","").split()
            if words and len(words[-1]) > 3 and words[-1] not in ("Butterfly",):
                if g not in genus_group:
                    genus_group[g] = words[-1]
    else:
        pelham_order = {}

    GENUS_GROUP_OVERRIDE = {"autochton":"","thorybes":"Cloudywing","urbanus":"Skipper",
                            "epargyreus":"Skipper","pholisora":"Sootywing"}
    genus_group.update(GENUS_GROUP_OVERRIDE)

    def sort_species(sp_set):
        def key(entry):
            m=re.search(r'\(([^)]+)\)$',entry)
            sci=m.group(1) if m else entry
            return pelham_order.get(sci,9999)
        return sorted(sp_set, key=key)

    # Parse vtblocks.kml (uses <SimpleData> schema — requires regex)
    with open(ALL_BLOCKS_KML, encoding="utf-8") as f:
        kml_text = f.read()

    blocks=[]
    for pm in re.split(r'<Placemark\b', kml_text)[1:]:
        fields={}
        for m in re.finditer(r'<SimpleData name="([^"]+)">(.*?)</SimpleData>', pm):
            fields[m.group(1)]=m.group(2).strip()
        block_type=fields.get("BLOCK_TYPE","").upper()
        blockname =fields.get("BLOCKNAME","")
        blockid   =fields.get("BLOCKID","")
        coord_m=re.search(r'<coordinates>(.*?)</coordinates>',pm,re.DOTALL)
        if not coord_m: continue
        pairs=[]
        for t in coord_m.group(1).strip().split():
            p=t.split(",")
            if len(p)>=2:
                try: pairs.append((float(p[0]),float(p[1])))
                except: pass
        if len(pairs)<3: continue
        poly=Polygon(pairs)
        blocks.append({"blockname":blockname,"blockid":blockid,"block_type":block_type,
                        "polygon":poly,"bounds":poly.bounds,"pairs":pairs})

    n_p=sum(1 for b in blocks if b["block_type"]=="PRIORITY")
    n_n=sum(1 for b in blocks if b["block_type"]=="NONPRIOR")
    print(f"  Parsed {len(blocks)} blocks: {n_p} PRIORITY + {n_n} NONPRIOR")

    block_species, block_genus_only = assign_occurrences(
        blocks, lambda b: b["blockid"], taxon_lookup, synonym_genus_map)

    features=[]
    for b in blocks:
        bid=b["blockid"]; sp=set(block_species.get(bid,set()))
        genera_in={s.split()[0].lower() for s in sp if s.split()}
        extra=block_genus_only.get(bid,set())-genera_in
        count=len(sp)+len(extra)
        sorted_sp=sort_species([fmt(s) for s in sp])
        genus_only_list=[{"display":g.capitalize()+" sp.","group":genus_group.get(g,"")}
                         for g in sorted(extra)]
        ring=[[p[0],p[1]] for p in b["pairs"]]
        features.append({"type":"Feature",
            "geometry":{"type":"Polygon","coordinates":[ring]},
            "properties":{"blockname":b["blockname"],"blockid":bid,
                          "block_type":b["block_type"],"count":count,
                          "species":sorted_sp,"genus_only":genus_only_list}})

    p_data=sum(1 for f in features if f["properties"]["block_type"]=="PRIORITY"
               and f["properties"]["count"]>0)
    n_data=sum(1 for f in features if f["properties"]["block_type"]=="NONPRIOR"
               and f["properties"]["count"]>0)
    print(f"  PRIORITY with data: {p_data}   NONPRIOR with data: {n_data}")
    return {"type":"FeatureCollection","features":features}


# ══════════════════════════════════════════════════════════════════
# Step 6: Patch HTML files with new GeoJSON + updated date
# ══════════════════════════════════════════════════════════════════
def patch_html(html_path, geojson, data_date, inat_date=None):
    if not html_path.exists():
        print(f"  WARNING: {html_path.name} not found — skipping")
        return
    with open(html_path, encoding="utf-8") as f:
        html = f.read()
    html = re.sub(r"const BLOCKS_DATA = \{.*?\};",
                  f"const BLOCKS_DATA = {json.dumps(geojson)};",
                  html, flags=re.DOTALL)
    html = re.sub(r"const DATA_UPDATED = '[^']+';",
                  f"const DATA_UPDATED = '{data_date}';", html)
    if inat_date:
        html = re.sub(r"const INAT_UPDATED = '[^']+';",
                      f"const INAT_UPDATED = '{inat_date}';", html)
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    note = f"  {html_path.name} updated — GBIF: {data_date}"
    if inat_date: note += f"  iNat: {inat_date}"
    print(note)


# ══════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    from datetime import date

    print("=" * 60)
    print("  VBA2 Data Updater")
    print("=" * 60)

    user, pwd, email = get_credentials()

    # Submit + wait
    key          = submit_download(user, pwd, email)
    download_url = wait_for_download(key)

    # Download + extract
    n_records = download_and_extract(download_url, user, pwd)

    # Determine data date from most recent 'modified' field in occurrence file
    data_date = date.today().isoformat()
    try:
        with open(OCC_FILE, newline="", encoding="utf-8") as f:
            dates = sorted(
                (row.get("modified","")[:10] for row in csv.DictReader(f, delimiter="\t")
                 if row.get("modified","")),
                reverse=True
            )
            if dates: data_date = dates[0]
    except Exception:
        pass

    # Fetch iNaturalist publication date
    print("Fetching iNaturalist publication date...")
    inat_date = get_inat_pub_date()
    print(f"  iNaturalist date: {inat_date}")

    # Load shared taxonomy once
    print("Loading taxonomy...")
    taxon_lookup, synonym_genus_map, sci_to_common = load_taxonomy()
    print(f"  {len(taxon_lookup)} taxon entries, {len(sci_to_common)} common name mappings")

    # Rebuild priority GeoJSON → patch species map (archived, no INAT_UPDATED field)
    priority_geojson = rebuild_priority_geojson(taxon_lookup, synonym_genus_map, sci_to_common)
    patch_html(SPECIES_MAP_HTML, priority_geojson, data_date)

    # Rebuild all-blocks GeoJSON → patch checklist tool
    all_geojson = rebuild_all_blocks_geojson(taxon_lookup, synonym_genus_map, sci_to_common)
    patch_html(CHECKLIST_HTML, all_geojson, data_date, inat_date=inat_date)

    print()
    print("=" * 60)
    print(f"  Done! {n_records:,} records processed.")
    print(f"  Data date: {data_date}")
    print(f"  Updated: {SPECIES_MAP_HTML.name}")
    print(f"           {CHECKLIST_HTML.name}")
    print("=" * 60)
