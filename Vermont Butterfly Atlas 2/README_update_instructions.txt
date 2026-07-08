VBA2 Data Update Instructions
==============================

These steps refresh the Vermont Butterfly Atlas 2 web app with the latest
occurrence data from GBIF (including iNaturalist records).

REQUIREMENTS
------------
- Python 3 installed on your machine
- A GBIF account (free at gbif.org)
- The "Vermont Butterfly Atlas 2" folder (this folder) containing:
      - update_data.py               (the update script)
      - taxon.csv                    (VBA2 species checklist)
      - vernacularName.csv           (common names)
      - species_master.json          (Pelham species order)
      - vtblocks.kml                 (all 1180 survey blocks)
      - priorityblocks04.kml         (184 priority blocks)
      - occurrence-VBA2-2.txt        (created/replaced by the script on each run)

STEPS
-----
1. Open a terminal (Mac: Applications > Utilities > Terminal)

2. Navigate to this folder:
      cd "Vermont Butterfly Atlas 2"

3. Run the update script:
      python3 update_data.py

4. When prompted, enter:
      - Your GBIF username
      - Your GBIF password
      - Your email address (GBIF sends a notification when the download is ready)

5. The script will:
      - Submit a download request to GBIF
      - Wait for GBIF to prepare the data (usually 5-15 minutes)
      - Download and extract the occurrence file
      - Rebuild both web app files

6. When finished, the following files will be updated:
      - vba2_species_map.html         (the main checklist tool)
      - vba2_species_map-archived.html (legacy priority-block map)

NOTES
-----
- The script installs required Python packages automatically if missing.
- The download can take 5-15 minutes depending on GBIF queue.
- Do not close the terminal while the script is running.
- If you see an error about credentials, double-check your GBIF username
  and password at gbif.org.

WHEN TO RUN
-----------
Run this when iNaturalist data at GBIF has been updated. The publication
date for the iNaturalist dataset can be checked at:
  https://www.gbif.org/dataset/50c9509d-22c7-4a22-a47d-8c48425ef4a7

Contact KP (kmcfarland@vtecostudies.org) with any questions.