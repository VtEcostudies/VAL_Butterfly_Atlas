import { getOccsByFilters } from '../VAL_Web_Utilities/js/fetchGbifOccs.js';
import { parseCanonicalFromScientific } from '../VAL_Web_Utilities/js/commonUtilities.js';
import { datasetKeys, getGbifSpeciesByDataset, getParentRank } from '../VAL_Web_Utilities/js/fetchGbifSpecies.js'; //file gets 2 lists on load
import { get, set, del, clear, keys, entries, getMany, setMany, delMany } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm';

const butterflyKeys = 'taxon_key=6953&taxon_key=5473&taxon_key=7017&taxon_key=9417&taxon_key=5481&taxon_key=1933999';
let showSubsp = 0; //flag to show SUBSPECIES in list (when no SPECIES parent is found, these remain...)
let showAll = 0; //flag to show all ranks - for testing

export async function getBlockOccs(dataset=false, gWkt=false, tKeys=false, years=false) {
    let page = {};
    let results = [];
    let off = 0;
    let lim = 300;
    let max = 9900;
    do {
      page = await getOccsByFilters(off, lim, dataset, gWkt, false, tKeys, years);
      results = results.concat(page.results);
      off += lim;
      if (page.endOfRecords || off>max) {page.results = results; return page;}
    } while (!page.endOfRecords && off<max);
}  
//Object keys from a species list are different from keys from an occurrence search...
function setDisplayObj(tax2Use, spc) {
    return {
        'nubKey': spc.nubKey,
        'taxonKey': spc.taxonKey ? spc.taxonKey : spc.key, //hack to handle occ results commingled with species results (occ.key is occurrence-key)
        'acceptedTaxonKey': spc.acceptedKey ? spc.acceptedKey : spc.acceptedTaxonKey,
        'subspKey': 'SUBSPECIES'==spc.rank ? spc.acceptedTaxonKey : false, //what is this reassignment?
        'speciesKey': spc.speciesKey, 'species': spc.species,
        'scientificName': tax2Use,
        'acceptedName': spc.accepted ? spc.accepted : spc.acceptedScientificName,
        'genusKey': spc.genusKey, 'genus': spc.genus,
        'familyKey': spc.familyKey, 'family': spc.family,
        'taxonRank': spc.taxonRank ? spc.taxonRank: spc.rank, //hack to handle occ results commingled with species results (occ.rank doesn't exist)
        'taxonStatus': spc.taxonomicStatus,
        'taxonSource': spc.taxonSource,
        'vernacularName': spc.vernacularName ? spc.vernacularName : (spc.vernacularNames ? (spc.vernacularNames[0] ? spc.vernacularNames[0].vernacularName : false) : false),
        'vernacularNames': spc.vernacularNames ? spc.vernacularNames : [],
        'image': false, //flag fillRow to show an image
        'eventDate': spc.eventDate,
        'occurrenceId': spc.occurrenceId
    }
}

let vtChecklist = false;
let vtNameIndex = false;

export async function getBlockSpeciesListVT(dataset=false, gWkt=false, tKeys=false, years=false) {
    let vtChecklist = await get('checkList_vtb1');
    console.log('get list from storage:', vtChecklist);
    if (!vtChecklist) {
        let list = await getGbifSpeciesByDataset(datasetKeys["chkVtb1"]); 
        vtChecklist = list.results;
    }
    console.log('vbaUtils.js=>getBlockSpeciesListVT=>checklistVtButterflies', vtChecklist);
    if (!vtNameIndex) {
        vtNameIndex = {}; //must init object
        for await (const spc of vtChecklist) {
            vtNameIndex[spc.canonicalName] = spc; //VT Butterflies Species-list indexed by name
        }
    }
    console.log('vbaUtils.js=>getBlockSpeciesListVT=>vtNameIndex', vtNameIndex);
    //check storage for occurrences already fetched for dataset/block/taxonKeys/years
    let storageName = `${dataset}_${gWkt}_${tKeys}_${years}`;
    let blockYearsList = await get(storageName);
    if (blockYearsList) {console.log(`vbaUtils.js=>getBlockSpeciesListVT=>getFromStorage(${storageName})`, blockYearsList); return blockYearsList;}
    if (!dataset && !tKeys) {tKeys = butterflyKeys;} //don't allow unconstrained queries
    //console.log('vbaSpeciesList=>getBlockSpeciesListVT: dataset:', dataset, 'tKeys:', tKeys, years, gWkt);
    let occs = await getBlockOccs(dataset, gWkt, tKeys, years);
    let objSpcs = {}; let objGnus = {};
    let arrOccs = occs.results;
    //console.log('vbaSpeciesList=>getBlockSpeciesListVT:', 'occ count:', arrOccs.length, 'results:', arrOccs);
    for (var i=0; i<arrOccs.length; i++) {
        let occ = arrOccs[i];
        let sciFull = occ.scientificName;
        let sciName = parseCanonicalFromScientific(occ, 'scientificName');
        let canName = sciName;
        let accFull = occ.acceptedScientificName;
        let accName = parseCanonicalFromScientific(occ, 'acceptedScientificName');

        let arrDate = occ.eventDate ? occ.eventDate.split('/') : [];
        let evtDate = arrDate.length ? arrDate[0] : 0;
        if (!evtDate) {console.log('EVENT DATE MISSING', occ.eventDate, sciName)}
        if (occ.eventDate != evtDate) {console.log('EVENT DATE CONTAINS RANGE', occ.eventDate, sciName)}

        let tax2Use =  false; let taxFrom = false; let spc = false;
        if (vtNameIndex[sciName]) {
            //console.log('FOUND ORIGINAL', sciName, 'in VT Index', vtNameIndex[sciName]);
            tax2Use = sciName;
            taxFrom = 'VT Butterflies <- GBIF Original';
            spc = vtNameIndex[sciName];
            spc.eventDate = evtDate; spc.occurrenceId = occ.occurrenceID; spc.taxonSource = taxFrom;
        } else if (vtNameIndex[accName]) {
            //console.log('FOUND BACKBONE', accName, 'in VT Index', vtNameIndex[accName]);
            tax2Use = accName;
            taxFrom = 'VT Butterflies <- GBIF Accepted';
            spc = vtNameIndex[accName];
            spc.eventDate = evtDate; spc.occurrenceId = occ.occurrenceID; spc.taxonSource = taxFrom;
        } else {
            tax2Use = accName;
            taxFrom = 'GBIF Backbone Accepted';
            spc = occ;
            spc.occurrenceId = occ.occurrenceID; spc.taxonSource = taxFrom;
            console.log('NEITHER FOUND - RESULT', sciName, accName, 'using species from Occurrence:', occ);
        }

        // Substitute accepted name for synonym if it exists
        if (spc.synonym && spc.accepted) {
            let accSynN = parseCanonicalFromScientific(spc, 'accepted', 'rank');
            if (vtNameIndex[accSynN]) {
                console.log('SYNONYM IN VT INDEX', tax2Use, 'WITH ACCEPTED NAME:', accSynN, `FOUND IN VT CHECKLIST`); //vtNameIndex[accSynN]);
                tax2Use = accSynN;
                spc = vtNameIndex[accSynN]; //we assume this is always valid
                taxFrom = 'VT Butterflies <- GBIF Synonym';
                spc.eventDate = evtDate; spc.occurrenceId = occ.occurrenceID; spc.taxonSource = taxFrom;
            } else {
                console.log(`SYNONYM IN VT INDEX`, tax2Use, `WITH ACCEPTED NAME:`, accSynN, `NOT FOUND IN VT CHECKLIST`);
            }
        }

        // Substitute SPECIES for SUBSPECIES if it exists
        if ('SUBSPECIES'==spc.rank) {
            if (spc.species) {
                console.log('SUBSTITUTE SPECIES FOR SUBSPECIES:', tax2Use, spc.key, spc.species); 
                let subspKey = spc.key;
                tax2Use = spc.species;
                spc = vtNameIndex[tax2Use];
                taxFrom += ' <- Subsp.';
                spc.subspKey = subspKey;
                spc.eventDate = evtDate; spc.occurrenceId = occ.occurrenceID; spc.taxonSource = taxFrom;
            } else {
                console.log('SUBSPECIES INCOMPLETE - NO parent SPECIES defined. Name:', tax2Use, 'species:', spc.species, 'parent:', spc.parent);
            }
        }

        if ('SPECIES' == spc.rank) {objGnus[spc.genus] = spc;} //create list of GENUS represented by lower taxa

        if (objSpcs[tax2Use]) { //We already added this taxon to our list. Check to replace name with more recent observation.
            if (spc.eventDate > objSpcs[tax2Use].eventDate) { //newer date. replace existing.
                console.log('getBlockSpeciesListVT FOUND MORE RECENT OBSERVATION for', canName, spc.eventDate, '>', objSpcs[tax2Use].eventDate);
                objSpcs[tax2Use] = setDisplayObj(tax2Use, spc);
            }
        } else { //Species taxon NOT found in our index. Add it.
            if (showAll) {
                objSpcs[tax2Use] = setDisplayObj(tax2Use, spc);
            } else {
                if ('SUBSPECIES'==spc.rank && showSubsp) {
                    objSpcs[tax2Use] = setDisplayObj(tax2Use, spc);
                }
                if ('SPECIES'==spc.rank) { //Always add SPECIES
                    objSpcs[tax2Use] = setDisplayObj(tax2Use, spc);
                }
                if ('GENUS'==spc.rank) { //Always add GENUS here. Remove below if redundant.
                    objSpcs[tax2Use] = setDisplayObj(tax2Use, spc);
                }
            }
        }
    }
    //we added records ranked GENUS, above. Now loop over the publishable object and remove GENUS records represented by SPECIES
    for (const key in objSpcs) {
        if ('GENUS' == objSpcs[key].taxonRank && objGnus[key]) {
            console.log('DELETE GENUS', key);//, objGnus[key], objSpcs[key])
            delete objSpcs[key];
        }
    }
    let objRes = {
        'occCount': arrOccs.length,
        'spcCount': Object.keys(objSpcs).length,
        'objSpcs': objSpcs, 
        'query': occs.query
        };
    set(storageName, objRes);
    return objRes;
}
