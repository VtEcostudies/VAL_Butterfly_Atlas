#!/usr/bin/env python3
"""
VBA2 Species Map — Data Updater
================================
Fetches a fresh occurrence download from GBIF using the VBA2 predicate,
then rebuilds the GeoJSON data and updates the web app HTML.

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

# ── Auto-install dependencies before importing them ───────────────
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
HERE        = Path(__file__).parent
OCC_FILE    = HERE / "occurrence-VBA2-2.txt"
TAXON_FILE  = HERE / "taxon.csv"
VERN_FILE   = HERE / "vernacularName.csv"
KML_FILE    = HERE / "priorityblocks04.kml"
HTML_FILE   = HERE / "vba2_species_map.html"

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

GBIF_API = "https://api.gbif.org/v1"

# ══════════════════════════════════════════════════════════════════
# Step 1: Credentials
# ══════════════════════════════════════════════════════════════════
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
        "creator":             user,
        "notification_address": [email],
        "sendNotification":    True,
        "format":              "DWCA",
        "predicate":           PREDICATE
    }
    print("Submitting download request to GBIF...")
    r = requests.post(
        f"{GBIF_API}/occurrence/download/request",
        json=payload,
        auth=(user, pwd),
        timeout=30
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
    print(f"Downloading from GBIF...")
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
                        pct = done / total * 100
                        print(f"\r  {pct:.0f}%  ({done/1_048_576:.1f} MB)", end="", flush=True)
        print()

        print("  Extracting occurrence file...")
        with zipfile.ZipFile(zip_path) as zf:
            names = zf.namelist()
            # Find the occurrence TSV inside the DWCA zip
            occ_name = next(
                (n for n in names if n.lower() == "occurrence.txt"),
                next((n for n in names if n.endswith(".txt") and "occurrence" in n.lower()), None)
            )
            if not occ_name:
                sys.exit(f"Could not find occurrence.txt in zip. Contents: {names}")
            zf.extract(occ_name, tmpdir)
            extracted = Path(tmpdir) / occ_name

            # Count records
            with open(extracted, encoding="utf-8") as f:
                n_lines = sum(1 for _ in f) - 1  # subtract header
            print(f"  {n_lines:,} occurrence records")

            # Replace the occurrence file
            import shutil
            shutil.copy(extracted, OCC_FILE)
            print(f"  Saved → {OCC_FILE.name}")

    return n_lines

# ══════════════════════════════════════════════════════════════════
# Step 5: Rebuild GeoJSON from updated occurrence file
# ══════════════════════════════════════════════════════════════════
def rebuild_geojson():
    print("Rebuilding species counts...")

    # Vernacular names
    vernacular = {}
    with open(VERN_FILE, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tid  = row["id"].strip()
            name = row["vernacularName"].strip()
            if row["isPreferredName"].strip().upper() == "TRUE" or tid not in vernacular:
                vernacular[tid] = name

    # Taxonomy — two-pass so accepted species always win
    with open(TAXON_FILE, newline="", encoding="utf-8") as f:
        taxon_rows = list(csv.DictReader(f))

    taxon_lookup = {}; synonym_genus_map = {}; sci_to_id = {}

    for row in taxon_rows:
        rank=row["taxonRank"].strip(); status=row["taxonomicStatus"].strip()
        genus=row["genus"].strip(); epithet=row["specificEpithet"].strip()
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
        genus=row["genus"].strip(); epithet=row["specificEpithet"].strip()
        sci=row["scientificName"].strip(); tid=row["taxonID"].strip()
        if status=="accepted" and rank=="species":
            sci_to_id[sci]=tid
            if genus and epithet:
                taxon_lookup[(genus.lower(), epithet.lower())]=sci

    sci_to_common = {sci: vernacular[tid]
                     for sci, tid in sci_to_id.items() if tid in vernacular}

    def resolve_name(genus, epithet):
        key=(genus.lower(), epithet.lower())
        if key in taxon_lookup: return taxon_lookup[key]
        ag=synonym_genus_map.get(genus.lower())
        if ag:
            key2=(ag, epithet.lower())
            if key2 in taxon_lookup: return taxon_lookup[key2]
            return f"{ag.capitalize()} {epithet}"
        return f"{genus} {epithet}"

    # KML blocks
    tree=ET.parse(KML_FILE); root=tree.getroot()
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

    # Occurrences → blocks
    block_species=defaultdict(set); block_genus_only=defaultdict(set)
    with open(OCC_FILE, newline="", encoding="utf-8") as f:
        reader=csv.DictReader(f, delimiter="\t")
        for i,row in enumerate(reader):
            if i%5000==0: print(f"  row {i}...", end="\r", flush=True)
            try:
                lat=float(row["decimalLatitude"]); lon=float(row["decimalLongitude"])
            except: continue
            rank=row.get("taxonRank","").strip().upper()
            genus=row.get("genus","").strip(); epithet=row.get("specificEpithet","").strip()
            if rank=="FAMILY" or not genus: continue
            pt=Point(lon,lat); assigned=None
            for b in blocks:
                mn,ms,mx,my=b["bounds"]
                if mn<=lon<=mx and ms<=lat<=my:
                    if b["polygon"].contains(pt): assigned=b["neblock"]; break
            if assigned is None: continue
            if rank=="GENUS":
                canonical=synonym_genus_map.get(genus.lower(),genus.lower())
                block_genus_only[assigned].add(canonical)
            elif rank in ("SPECIES","SUBSPECIES") and epithet:
                block_species[assigned].add(resolve_name(genus,epithet))

    print()

    def fmt(sci):
        common=sci_to_common.get(sci)
        return f"{common} ({sci})" if common else sci

    for b in blocks:
        nb=b["neblock"]; sp=set(block_species.get(nb,set()))
        genera_in={s.split()[0].lower() for s in sp if s.split()}
        extra=block_genus_only.get(nb,set())-genera_in
        b["count"]=len(sp)+len(extra)
        b["species_list"]=sorted([fmt(s) for s in sp],key=str.lower)
        b["genus_only"]=sorted([g.capitalize()+" sp." for g in extra])

    counts=[b["count"] for b in blocks]
    print(f"  Blocks with data: {sum(1 for c in counts if c>0)}")
    print(f"  Green ≥40: {sum(1 for c in counts if c>=40)}  "
          f"Yellow 30-39: {sum(1 for c in counts if 30<=c<40)}  "
          f"Orange 20-29: {sum(1 for c in counts if 20<=c<30)}  "
          f"Red <20: {sum(1 for c in counts if 0<c<20)}")

    features=[]
    for b in blocks:
        ring=[[p[0],p[1]] for p in b["pairs"]]
        features.append({"type":"Feature",
            "geometry":{"type":"Polygon","coordinates":[ring]},
            "properties":{"neblock":b["neblock"],"blockname":b["blockname"],
                          "count":b["count"],"species":b["species_list"],
                          "genus_only":b["genus_only"]}})

    return {"type":"FeatureCollection","features":features}

# ══════════════════════════════════════════════════════════════════
# Step 6: Patch the HTML with new GeoJSON + updated date
# ══════════════════════════════════════════════════════════════════
def patch_html(geojson, data_date):
    if not HTML_FILE.exists():
        print(f"  WARNING: {HTML_FILE.name} not found — skipping HTML update")
        return

    print("Patching HTML...")
    with open(HTML_FILE, encoding="utf-8") as f:
        html = f.read()

    # Replace GeoJSON data
    geojson_str = json.dumps(geojson)
    html = re.sub(
        r"const BLOCKS_DATA = \{.*?\};",
        f"const BLOCKS_DATA = {geojson_str};",
        html, flags=re.DOTALL
    )

    # Replace data updated date
    html = re.sub(
        r"const DATA_UPDATED = '[^']+';",
        f"const DATA_UPDATED = '{data_date}';",
        html
    )

    with open(HTML_FILE, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  HTML updated — data date set to {data_date}")

# ══════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    from datetime import date

    print("=" * 56)
    print("  VBA2 Species Map — Data Updater")
    print("=" * 56)

    user, pwd, email = get_credentials()

    # Submit + wait
    key          = submit_download(user, pwd, email)
    download_url = wait_for_download(key)

    # Download + extract
    n_records = download_and_extract(download_url, user, pwd)

    # Get the most recent modified date from the new file
    data_date = date.today().isoformat()
    try:
        with open(OCC_FILE, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter="\t")
            dates  = sorted(
                (row.get("modified","")[:10] for row in reader if row.get("modified","")),
                reverse=True
            )
            if dates: data_date = dates[0]
    except Exception:
        pass

    # Rebuild GeoJSON
    geojson = rebuild_geojson()

    # Patch HTML
    patch_html(geojson, data_date)

    print()
    print("=" * 56)
    print(f"  Done! {n_records:,} records processed.")
    print(f"  Data date: {data_date}")
    print(f"  Open {HTML_FILE.name} in a browser to view the updated map.")
    print("=" * 56)
