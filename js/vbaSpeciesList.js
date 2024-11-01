import { getBlockSpeciesListVT } from './vbaUtils.js';
import { getOccsByFilters } from '../VAL_Web_Utilities/js/fetchGbifOccs.js';
import { getWikiPage } from '../VAL_Web_Utilities/js/wikiPageData.js'
import { parseCanonicalFromScientific } from '../VAL_Web_Utilities/js/commonUtilities.js';
import { getSheetVernaculars } from '../VAL_Web_Utilities/js/fetchGoogleSheetsData.js';
import { getParentRank } from '../VAL_Web_Utilities/js/fetchGbifSpecies.js'; //file gets 2 lists on load
import { fetchInatGbifDatasetInfo, fetchEbutGbifDatasetInfo, datasetKeys, gbifDatasetUrl } from "../VAL_Web_Utilities/js/fetchGbifDataset.js";
import { init, draw, update } from './doubleSlider.js';
import { getInatSpecies } from '../VAL_Web_Utilities/js/inatSpeciesData.js';
import { tableSortHeavy } from '../VAL_Web_Utilities/js/tableSortHeavy.js';

var siteName = 'vtButterflies';
var homeUrl;
var exploreUrl;
var resultsUrl;
var profileUrl;
/*
let showSubsp = 0; //flag to show SUBSPECIES in list (when no SPECIES parent is found, these remain...)
let showAll = 0; //flag to show all ranks - for testing
let vtNameIndex = {};
*/
const objUrlParams = new URLSearchParams(window.location.search);
const gadmGid = objUrlParams.get('gadmGid');
const geometry = objUrlParams.get('geometry');
const centrLat = objUrlParams.get('lat');
const centrLon = objUrlParams.get('lon');
const mapZoom = objUrlParams.get('zoom');
const dataset = objUrlParams.get('dataset');
const block = objUrlParams.get('block');
const year = objUrlParams.get('year');
const compare = objUrlParams.get('compare'); //same format as year - year-range to compare to primary year-range
const taxonKeyA = objUrlParams.getAll('taxonKey');
console.log('Query Param(s) taxonKey:', taxonKeyA);
const yearMin = 1800;
const yearMax = 2030;
var years = `${yearMin},${yearMax}`;

console.log('Query Params Lat Lon Zoom', centrLat, centrLon, mapZoom)

const butterflyKeys = 'taxon_key=6953&taxon_key=5473&taxon_key=7017&taxon_key=9417&taxon_key=5481&taxon_key=1933999';
var sheetVernacularNames = getSheetVernaculars();

var other = ''; var objOther = {};
objUrlParams.forEach((val, key) => {
    if ('geometry'!=key && 'block'!=key && 'dataset'!=key) {
      other += `&${key}=${val}`;
      objOther[key] = val;
    }
  });

const eleDiv = document.getElementById("speciesListDiv");
const eleTbl = document.getElementById("speciesListTable");
const eleTtl = document.getElementById("speciesListTitle");
const eleInat =  document.getElementById("inatInfoLabel");
const eleEbut =  document.getElementById("ebutInfoLabel");
const eleMin = document.getElementById('min');
const eleMax = document.getElementById('max');
const eleAtlas = document.getElementById('atlas');
const eleCmpar = document.getElementById('compare');

var sliders = document.querySelectorAll('.min-max-slider');

if (year) {
    years = year;
    let yrs = year.split(',');
    let min = yrs[0] ? Number(yrs[0]) : yearMin;
    let max = yrs[1] ? Number(yrs[1]) : yearMax;
    if (1 == yrs.length) {max = min;} //if a single year was requested, set both to that value
    //if (min < min) {min = yearMin;}
    //if (max > max) {max = yearMax;}
    let avg = Math.floor((min + max)/2);
    console.log('Set slider to year values', min, max, avg);
    eleMin.setAttribute("data-value", min);
    eleMax.setAttribute("data-value", max);
    sliders.forEach(slider => {draw(slider, avg, min, max)});
    eleAtlas.value=yearsToDrop(year); //unset atlas drop-down list
}
if (compare) {
    eleCmpar.value=yearsToDrop(compare);
}
function yearsToDrop(years) { //years is string, like '2002,2007'
    let val = null;
    switch(years) {
        case `${yearMin},${yearMax}`: val='A'; break;
        case `${yearMin},2001`: val='B'; break;
        case `2002,2007`: val='1'; break;
        case `2008,2022`: val='T'; break;
        case `2023,2027`: val='2'; break;
        case `2028,${yearMax}`: val='1'; break;
        case `2050,2050`: val='N'; break;
    }
    return val;
}

function dropToYears(val) {
    let min = yearMin;
    let max = yearMax;

    switch(val) {
        case "N": //None
            min = 2050;
            max = 2050;
            break;
        case "A": //All years
            min = yearMin;
            max = yearMax;
            break;
        case "B": //before VBA1
            min = yearMin;
            max = 2001;
            break;
        case "1": //VBA1
            min = 2002;
            max = 2007;
            break;
        case "T": //between VBA1 and VBA2 
            min = 2008;
            max = 2022;
            break;
        case "2": //VBA2
            min = 2023;
            max = 2027;
            break;
        case "R": //After VBA2
            min = 2028;
            max = yearMax;
            break;
    }
    return {'min':min, 'max':max};
}

var loadPromise = Promise.resolve(1); //dummy promise to start

eleAtlas.addEventListener("change", ev => {
    console.log('Atlas drop-down', ev.target);
    let val = ev.target.value;
    let yng = dropToYears(val);
    let min = yng.min;
    let max = yng.max;
    let avg = Math.floor((min + max)/2);
    avg = Math.floor((min + max)/2);
    eleMin.setAttribute("data-value", min);
    eleMax.setAttribute("data-value", max);
    sliders.forEach(slider => {draw(slider, avg);});
    let cmp = eleCmpar.value;
    let rng = dropToYears(cmp);
    years = `${min},${max}`; //used by table to query gbif-explorer
    loadPromise.then(() => {
        loadPromise = loadPage(block, geometry, taxonKeyA, `${min},${max}`, `${rng.min},${rng.max}`);
    })
})

eleMin.addEventListener("change", ev => {
    console.log(ev.target.value, ev);
    let min = parseInt(ev.target.value);
    let max = parseInt(eleMax.value);
    let cmp = eleCmpar.value;
    let rng = dropToYears(cmp);
    eleAtlas.value=null; //unset atlas drop-down list
    years = `${min},${max}`; //used by table to query gbif-explorer
    loadPromise.then(() => {
        loadPromise = loadPage(block, geometry, taxonKeyA, `${min},${max}`, `${rng.min},${rng.max}`);
    })
})
eleMax.addEventListener("change", ev => {
    console.log(ev.target.value, ev);
    let max = parseInt(ev.target.value);
    let min = parseInt(eleMin.value);
    let cmp = eleCmpar.value;
    let rng = dropToYears(cmp);
    eleAtlas.value=null; //unset atlas drop-down list
    years = `${min},${max}`; //used by table to query gbif-explorer
    loadPromise.then(() => {
        loadPromise = loadPage(block, geometry, taxonKeyA, `${min},${max}`, `${rng.min},${rng.max}`);
    })
})

eleCmpar.addEventListener("change", ev => {
    console.log('Compare drop-down:', ev.target);
    let val = ev.target.value;
    let rng = dropToYears(val);
    let min = parseInt(eleMin.value);
    let max = parseInt(eleMax.value);
    loadPromise.then(() => {
        loadPromise = loadPage(block, geometry, taxonKeyA, `${min},${max}`, `${rng.min},${rng.max}`);
    })
})
/*
async function getBlockOccs(dataset=false, gWkt=false, tKeys=false, years=false) {
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

async function LocalGetBlockSpeciesListVT(dataset=false, gWkt=false, tKeys=false, years=false) {
    let occs = await getBlockOccs(dataset, gWkt, tKeys, years);
    let objSpcs = {}; let objGnus = {};
    let arrOccs = occs.results;
    //console.log('vbaSpeciesList=>getBlockSpeciesListVT: block:', block, 'occ count:', arrOccs.length, 'results:', arrOccs);
    for (var i=0; i<arrOccs.length; i++) {
        let occ = arrOccs[i];

        let sciFull = occ.scientificName;
        let sciName = parseCanonicalFromScientific(occ, 'scientificName');
        let canName = sciName;
        let accFull = occ.acceptedScientificName;
        let accName = parseCanonicalFromScientific(occ, 'acceptedScientificName');

        let arrDate = occ.eventDate ? occ.eventDate.split('/') : [];
        let evtDate = arrDate.length ? arrDate[0] : 0;
        if (!evtDate != evtDate) {console.log('EVENT DATE MISSING', occ.eventDate, sciName)}
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
            //console.log('NEITHER FOUND - SOURCE', sciName, accName, 'using Occ:', occ);
            tax2Use = accName;
            taxFrom = 'GBIF Backbone Accepted';
            spc = occ;
            spc.occurrenceId = occ.occurrenceID; spc.taxonSource = taxFrom;
            console.log('NEITHER FOUND - RESULT', sciName, accName, 'using Occ:', occ, 'leaving spc:', spc);
        }

        // Substitute accepted name for synonym if it exists
        if (spc.synonym && spc.accepted) {
            let accSynN = parseCanonicalFromScientific(spc, 'accepted', 'rank');
            console.log('SYNONYM IN VT INDEX', tax2Use, spc, 'ACCEPTED:', accSynN, vtNameIndex[accSynN]);
            tax2Use = accSynN;
            spc = vtNameIndex[accSynN]; //we assume this is always valid
            taxFrom = 'VT Butterflies <- GBIF Synonym';
            spc.eventDate = evtDate; spc.occurrenceId = occ.occurrenceID; spc.taxonSource = taxFrom;
        }

        // Substitute SPECIES for SUBSPECIES if ti exists
        if ('SUBSPECIES'==spc.rank) {
            console.log('SUBSPECIES:', tax2Use, spc); 
            if (spc.species) {
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
            console.log('DELETE GENUS', key, objGnus[key], objSpcs[key])
            delete objSpcs[key];
        }
    }
    return {
        'cols': {
            taxonKey:'Taxon Key',
            scientificName:'Name',
            family:'Family',
            taxonRank:'Rank',
            //taxonSource:'Source',
            vernacularName:'Common Name',
            image:'Image',
            eventDate:'Last Observed'
            //,occurrenceId:'Occurrence ID'
         },
        'colIds' : {
            'Taxon Key':0
            ,'Name':1
            ,'Family':2
            ,'Rank':3
            ,'Common Name':4
            ,'Image':5
            ,'Last Observed':6
            //,'OccurrenceID':7
        },
        'occCount': arrOccs.length,
        'objSpcs': objSpcs, 
        'query': occs.query
    };
}
*/
async function wrapGetBlockSpeciesListVT(dataset, gWkt, tKeys, years) {
    let res = await getBlockSpeciesListVT(dataset, gWkt, tKeys, years);
    //add the columns and columnIds to show in the table
    res.cols = {
        taxonKey:'Taxon Key',
        scientificName:'Name',
        family:'Family',
        taxonRank:'Rank',
        //taxonSource:'Source',
        vernacularName:'Common Name',
        image:'Image',
        eventDate:'Last Observed'
        //,occurrenceId:'Occurrence ID'
     }
    res. colIds = {
        'Taxon Key':0
        ,'Name':1
        ,'Family':2
        ,'Rank':3
        ,'Common Name':4
        ,'Image':5
        ,'Last Observed':6
        //,'OccurrenceID':7
    }
    return res;
}

async function compareBlockSpeciesLists(dataset=false, gWkt=false, tKeys=false, years=false, compare=false) {
    let tres = await wrapGetBlockSpeciesListVT(dataset, gWkt, tKeys, years);
    let cres = await wrapGetBlockSpeciesListVT(dataset, gWkt, tKeys, compare);
    let trgt = tres.objSpcs; 
    for (const key in cres.objSpcs) { //remove entries from target that are also found in compare
        if (trgt[key]) {
            console.log('COMPARE DELETE', key); 
            delete trgt[key];
        }
    }
    tres.objSpcs = trgt;
    return tres;
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
    
/*
geometry=POLYGON((-73.0 44.0,-72.75 44.0,-72.75 44.2,-73.0 44.2,-73.0 44.0))
coordinates: Array (1)
  coordinates[0]: Array(5)
    0: Array [ -72.56200954781823, 44.291742756710484 ]
    1: Array [ -72.56205261876526, 44.25007688817722 ]
    2: Array [ -72.62455517288059, 44.2500594469373 ]
    3: Array [ -72.6245558831222, 44.2917251487992 ]
    4: Array [ -72.56200954781823, 44.291742756710484 ]
*/
async function getBlockSpeciesListBackbone(block='block_name', dataset=false, gWkt=false, tKeys=false, years=false) {

    let occs = await getOccsByFilters(0,300,dataset,gWkt,false,tKeys,years);
    //console.log('getBlockSpeciesList', occs);
    let hedSpcs = 'Species List for ' + block + (dataset ? ` and dataset ${dataset}` : '')
    let objSpcs = {}; let objGnus = {};
    let arrOccs = occs.results;
    //console.log('getBlockSpecieslist', block, arrOccs);
    for (var i=0; i<arrOccs.length; i++) {
        let sciName = parseCanonicalFromScientific(arrOccs[i], 'scientificName');
        let accName = parseCanonicalFromScientific(arrOccs[i], 'acceptedScientificName');
        let canName = parseCanonicalFromScientific(arrOccs[i], 'scientificName');
        let sciFull = arrOccs[i].scientificName;
        let accFull = arrOccs[i].acceptedScientificName;
        let sciKey = arrOccs[i].key;
        let accKey = arrOccs[i].acceptedTaxonKey;
        let taxRank = arrOccs[i].taxonRank.toUpperCase();
        let taxSpcs = arrOccs[i].species;
        let taxGnus = arrOccs[i].genus;
        if (sciName != accName) {
            console.log('getBlockSpeciesList found occurrence having SYNONYM', canName, accName, taxRank, taxSpcs, arrOccs[i]);
        }
        /*
            Due to errors in GBIF butterfly taxonomies, we show both the 'Applied' name submitted with the original observation,
            and the 'Accepted' name matched from the GBIF backbone. The values we get from the occurrence API, 'species' and
            'speciesKey', 'genus' and 'genusKey', needed here to show Species List style values from occurrence results, derive
            from the Accepted name.
        */
        if (objSpcs[taxSpcs]) { //check to replace name with more recent observation
            if (arrOccs[i].eventDate > objSpcs[taxSpcs].eventDate) { //newer date. replace existing.
                console.log('getOccsByFilters FOUND MORE RECENT OBSERVATION for', sciName, arrOccs[i].eventDate, '>', objSpcs[taxSpcs].eventDate);
                objSpcs[taxSpcs] = {
                    'taxonKey': arrOccs[i].taxonKey, //this is supposedly a key to the original observation taxon, Applied Name
                    'acceptedTaxonKey': arrOccs[i].speciesKey, //arrOccs[i].acceptedTaxonKey, //here's where we substitute SPECIES for SUBSP. in our list
                    'subspKey': 'SUBSPECIES'==taxRank ? arrOccs[i].acceptedTaxonKey : false,
                    'scientificName': taxSpcs, //sciName
                    'acceptedName': accName,
                    'taxonRank': 'SPECIES', //taxRank
                    'vernacularName': arrOccs[i].vernacularName, //not used - see fillRow
                    'image': false,
                    'eventDate':  arrOccs[i].eventDate,
                    'occurrenceId': arrOccs[i].occurrenceID
                };
            }
        } else { //add new name here only if rank is SPECIES or SUBSPECIES. Deal with GENUS not represented by SPECIES later.
            if ('SPECIES'==taxRank || 'SUBSPECIES'==taxRank) { //...but roll SUBSP into SPECIES...
                objSpcs[taxSpcs] = {
                    'taxonKey': arrOccs[i].taxonKey,
                    'acceptedTaxonKey': arrOccs[i].speciesKey, //arrOccs[i].acceptedTaxonKey,
                    'subspKey': 'SUBSPECIES'==taxRank ? arrOccs[i].acceptedTaxonKey : false,
                    'scientificName': taxSpcs, //sciName
                    'acceptedName': accName,
                    'taxonRank': 'SPECIES', //taxRank,
                    'vernacularName': arrOccs[i].vernacularName, //not used - see fillRow
                    'image': false,
                    'eventDate':  arrOccs[i].eventDate,
                    'occurrenceId': arrOccs[i].occurrenceID
                };
                objGnus[taxGnus]={'canonicalName':canName, 'taxonRank':taxRank}; //add to checklist of GENUS already represented in list
            }
        }
    }
    //loop again looking for GENUS not listed yet
    for (var i=0; i<arrOccs.length; i++) {
        let sciName = arrOccs[i].scientificName;
        let accName = parseCanonicalFromScientific(arrOccs[i], 'acceptedScientificName');
        let canName = parseCanonicalFromScientific(arrOccs[i]);
        let taxRank = arrOccs[i].taxonRank.toUpperCase();
        let taxGnus = arrOccs[i].genus;
        if ('GENUS'==taxRank && !objGnus[taxGnus]) {
            objSpcs[taxGnus] = {
                'taxonKey': arrOccs[i].taxonKey,
                'acceptedTaxonKey': arrOccs[i].acceptedTaxonKey,
                'scientificName': taxGnus, //sciName,
                'acceptedName': accName,
                'taxonRank': taxRank,
                'vernacularName': arrOccs[i].vernacularName, //not used - see fillRow
                'image': false,
                'eventDate':  arrOccs[i].eventDate,
                'occurrenceId': arrOccs[i].occurrenceID
            }
            objGnus[taxGnus]={'canonicalName':canName, 'taxonRank':taxRank};
        }
    }
    return {
        'head': hedSpcs, 
        'cols': {
            taxonKey:'Taxon Key',
            acceptedTaxonKey:'Accepted Key',
            scientificName:'Applied Name',
            acceptedName:'Accepted Name',
            family:'Family',
            taxonRank:'Rank',
            vernacularName:'Common Name',
            image:'Image',
            eventDate:'Last Observed'}, 
        'objSpcs': objSpcs, 
        'query': occs.query
    };
}
var waitRow; var waitObj;

async function addTableWait() {
    waitRow = eleTbl.insertRow(0);
    waitObj = waitRow.insertCell(0);
    waitObj.style = 'text-align: center;';
    waitObj.innerHTML = `<i class="fa fa-spinner fa-spin" style="font-size:60px;"></i>`;
}

async function delTableWait() {
    waitObj.remove();
    waitRow.remove();
}

async function addGBIFLink(geometry, taxonKeys, count) {
    let eleGBIF = document.getElementById("gbifLink");
    //eleGBIF.href = `https://www.gbif.org/occurrence/search?${taxonKeys}&geometry=${geometry}`;
    //eleGBIF.href = `${exploreUrl}?siteName=${siteName}&view=MAP&${taxonKeys}&geometry=${geometry}`;
    eleGBIF.href = `${exploreUrl}?siteName=${siteName}&view=MAP&geometry=${geometry}&lat=${centrLat}&lon=${centrLon}&zoom=${mapZoom}`;
    eleGBIF.target = "_blank";
    eleGBIF.innerText = `GBIF Occurrences (${count})`;
}

//put one row in the header for column names
async function addTableHead(headCols={taxonKey:'Taxon Key',scientificName:'Scientific Name',taxonRank:'Taxon Rank',vernacularName:'Common Name',image:'Image',eventDate:'Last Observed'}) {
    console.log('HEADER COLUMNS', headCols);
    let objHed = eleTbl.createTHead();
    let hedRow = objHed.insertRow(0);
    let colObj;
    var i=0;
    for (const key in headCols) { //objList of header items having column key and header display name
        colObj = hedRow.insertCell(i++);
        colObj.innerText = headCols[key];
    }
}
  
//Create table row for each array element, then fill row of cells
async function addTaxaFromArr(objSpcs, hedObj) {
    //console.log('addTaxaFromArr', objSpcs);
    let rowIdx=0;
    for (const [spcKey, objSpc] of Object.entries(objSpcs)) {
        //console.log(objSpc, rowIdx)
        let objRow = await eleTbl.insertRow(rowIdx);
        await fillRow(spcKey, objSpc, objRow, rowIdx++, hedObj);
    }
  }

//Create cells for each object element
async function fillRow(spcKey, objSpc, objRow, rowIdx, hedObj) {
    let colIdx = 0;
    for (const [key, val] of Object.entries(objSpc)) {
        let colObj;
        let href;
        let rawKey = objSpc.taxonKey;
        let accKey = objSpc.acceptedTaxonKey;
        let nubKey = objSpc.nubKey;
        //console.log('key:', key);
        //console.log('fillRow', key, val, hedObj[key], hedObj[`${key}`])
        if (hedObj[key]) { //filter species object through header object
        switch(key) {
            case 'image':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = `<i class="fa fa-spinner fa-spin" style="font-size:18px"></i>`;
                var att = 1;
                getWikiImg(att);
                function getInatImg(att) {
                    att = 0;
                    let inat = getInatSpecies(spcKey, objSpc.taxonRank, objSpc.parent, getParentRank(objSpc.taxonRank)); 
                    inat.then(inat => {
                        if (inat.default_photo) {
                            colObj.innerHTML = '';
                            let iconImg = document.createElement("img");
                            iconImg.src = inat.default_photo.medium_url;
                            iconImg.alt = inat.default_photo.attribution;
                            iconImg.className = "icon-image";
                            iconImg.width = "30"; 
                            iconImg.height = "30";
                            let hrefImg = document.createElement("a");
                            hrefImg.href = inat.default_photo.medium_url;
                            hrefImg.target = "_blank";
                            colObj.appendChild(hrefImg);
                            hrefImg.appendChild(iconImg);
                        } else if (att) {
                            console.log(`getInatSpecies NO PHOTO. Attempt wiki(${att})`); 
                            att=0; getWikiImg(att);
                        }
                    })
                    inat.catch(err=> {
                        console.error(`getInatSpecies ERROR. Attempt wiki(${att})`, 'ERROR', err,); 
                        if (att) {att=0; getWikiImg(att);}
                    });
                }
                function getWikiImg(att) {
                    let wik = getWikiPage(spcKey);
                    colObj.innerHTML = '';
                    wik.then(wik => {
                        if (wik.thumbnail) {
                            let iconImg = document.createElement("img");
                            iconImg.src = wik.thumbnail.source;
                            iconImg.alt = spcKey;
                            iconImg.className = "icon-image";
                            iconImg.width = "30"; 
                            iconImg.height = "30";
                            let hrefImg = document.createElement("a");
                            hrefImg.href = wik.originalimage.source;
                            hrefImg.target = "_blank";
                            colObj.appendChild(hrefImg);
                            hrefImg.appendChild(iconImg);
                        } else if (att) {
                            console.log(`getWikiImg NO PHOTO. Attempt iNat(${att})`); 
                            att=0; getInatImg(att);
                        }
                    })
                    wik.catch(err => {
                        console.error(`getWikiPage ERROR.  Attempt iNat(${att})`, 'ERROR', err); 
                        if (att) {att=0; getInatImg(att);}
                    })
                }
                break;
            case 'scientificName':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = `<a title="VAL Species Profile: ${val}" href="${profileUrl}?siteName=${siteName}&taxonKey=${rawKey}&taxonName=${val}">${val}</a>`;
                break;
            case 'acceptedName':
                colObj = objRow.insertCell(colIdx++);
                if (val) {
                    colObj.innerHTML = `<a title="VAL Species Profile: ${val}" href="${profileUrl}?siteName=${siteName}&taxonKey=${accKey}&taxonName=${val}">${val}</a>`;
                } else {colObj.innerHTML = '';}
                break;
            case 'eventDate':
                colObj = objRow.insertCell(colIdx++);
                let rang = val ? val.split('/') : []; if (rang[1]) {console.log(`Occurrence having date range: ${val}`);}
                let date = val ? val.split('/')[0] : false;
                date = date ? moment(date).format('YYYY-MM-DD') : 'N/A';
                href = `${exploreUrl}?view=MAP&gbif-year=${years}&taxonKey=${nubKey}&geometry=${geometry}&lat=${centrLat}&lon=${centrLon}&zoom=${mapZoom}`;
                colObj.innerHTML = colObj.innerHTML = `<a title="GBIF Occurrences for ${block} ${objSpc.scientificName}(${nubKey}) ${years}" href="${href}">${date}</a>`;
                break;
            case 'occurrenceId':
                colObj = objRow.insertCell(colIdx++);
                href = `${exploreUrl}?view=MAP&occurrenceId=${val}`;
                colObj.innerHTML = colObj.innerHTML = `<a title="GBIF Occurrence Record: ${val}" href="${href}">${val}</a>`;
                break;
            case 'vernacularName': //don't use GBIF occurrence value for vernacularName, use VAL checklist or VAL google sheet
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = val ? val : (sheetVernacularNames[key] ? sheetVernacularNames[key][0].vernacularName : '');
                break;
            case 'taxonKey':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = `<a title="Gbif Species Profile: ${val}" href="https://gbif.org/species/${val}">${val}</a>`;
                break;
            case 'acceptedTaxonKey':
                colObj = objRow.insertCell(colIdx++);
                if (val) {
                    colObj.innerHTML = `<a title="Gbif Species Profile: ${val}" href="https://gbif.org/species/${val}">${val}</a>`;
                } else {colObj.innerHTML = '';}
                break;
            case 'taxonRank':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = val ? val : '';
                if (objSpc.subspKey) {
                    colObj.innerHTML += ` <a title="Gbif Subspecies Profile: ${objSpc.subspKey}" href="https://gbif.org/species/${objSpc.subspKey}">(from Subsp.)</a>`;
                }
                break;
            case 'taxonStatus':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = val;
                break;
            case 'taxonSource':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = val;
                break;
            case 'family':
                colObj = objRow.insertCell(colIdx++);
                colObj.innerHTML = val;
                break;
            default:
                //colObj.innerHTML = val ? val : '';
                break;
        }
        } //end if (hedObj[key])
    }
}

function setTitleText(block, dataset=false, taxonKeys=false, count=0) {
    if (eleTtl) {
        eleTtl.innerHTML = 
        `VT Butterfly Atlas Species List for Survey Block ${block}${dataset ? ' and dataset ' + dataset : ''}: (<u>${count} taxa</u>)`;
    }
}

function setEbutInfo() {
    let ebut = fetchEbutGbifDatasetInfo();
    console.log('setEbutInfo:', ebut);
    if (eleEbut) {
        ebut.then(ebut => {
            eleEbut.innerHTML = `<a href="${gbifDatasetUrl}/${datasetKeys.ebut}">eButterfly-GBIF</a> Updated on <i>${moment.utc(ebut.pubDate).format('YYYY-MM-DD')}</i>`;
        })
    }
}

function setInatInfo() {
    let inat = fetchInatGbifDatasetInfo();
    console.log('setInatInfo:', inat);
    if (eleInat) {
        inat.then(inat => {
            eleInat.innerHTML = `<a href="${gbifDatasetUrl}/${datasetKeys.inat}">iNaturalist-GBIF</a> Updated on <i>${moment.utc(inat.pubDate).format('YYYY-MM-DD')}</i>`;
        })
    }
}
function enableInput() {
    eleAtlas.disabled = false;
    eleCmpar.disabled = false;
    eleMin.disabled = false;
    eleMax.disabled = false;
}
function disableInput() {
    eleAtlas.disabled = true;
    eleCmpar.disabled = true;
    eleMin.disabled = true;
    eleMax.disabled = true;
}
async function loadPage(block, geometry, taxonKeyA, years=false, compare=false) {
    disableInput();
    let taxonKeys;
    eleTbl.innerHTML = "";
    addTableWait();
    //vernaculars = await getVernaculars();
    if (!dataset && !taxonKeyA.length) {taxonKeys = butterflyKeys;}
    if (taxonKeyA.length) {
        taxonKeys = taxonKeyA.map(key => key.join(','));
    }
    let spcs = {}
    if (compare) {
        spcs = await compareBlockSpeciesLists(dataset, geometry, taxonKeys, years, compare);
    } else {
        spcs = await wrapGetBlockSpeciesListVT(dataset, geometry, taxonKeys, years);
    }
    await addGBIFLink(geometry, taxonKeys, spcs.occCount);
    await addTaxaFromArr(spcs.objSpcs, spcs.cols);
    await addTableHead(spcs.cols);
    delTableWait();
    setTitleText(block, dataset, taxonKeys, Object.keys(spcs.objSpcs).length);
    setEbutInfo();
    setInatInfo();
    setDataTable(spcs.colIds); //MUST be called after table has finished updating.
    setPageUrl(block, geometry, taxonKeyA, years, compare);
    enableInput();
    return Promise.resolve(1);
}

//Set page URL to in-page settings without reloading the page
async function setPageUrl(block, geometry, taxonKeyA, years, compare) {
    if (years) {objUrlParams.set('year', `${years}`);}
    if (compare) {objUrlParams.set('compare', `${compare}`);}
    const thisUrl = new URL(document.URL);
    const homeUrl = `${thisUrl.protocol}//${thisUrl.host}`;
    let stateObj = {block:block, geometry:geometry, taxonKeyA:taxonKeyA, year:years, compare:compare};
    let stateUrl = `${homeUrl}${thisUrl.pathname}?${decodeURI(objUrlParams.toString())}`;
    history.replaceState(stateObj, "", stateUrl);
}

//get atlas configuration and startup
import(`../VAL_Web_Utilities/js/gbifDataConfig.js?siteName=${siteName}`)
  .then(fCfg => {
    console.log('siteName:', siteName, 'dataConfig:', fCfg.dataConfig);
    startUp(fCfg);
  })

async function startUp(fCfg) {
    homeUrl = `https://val.vtecostudies.org`;//fCfg.dataConfig.homeUrl;
    exploreUrl = `https://val.vtecostudies.org/gbif-explorer`;//fCfg.dataConfig.exploreUrl;
    resultsUrl = `https://val.vtecostudies.org/gbif-species-explorer`;//fCfg.dataConfig.resultsUrl;
    profileUrl = `https://val.vtecostudies.org/species-profile`;//fCfg.dataConfig.profileUrl;
  
    if (block && geometry) {
        loadPromise = loadPage(block, geometry, taxonKeyA, year, compare);
    } else {
        alert(`Must call with at least the query parameters 'block' and 'geometry'. Alternatively pass a dataset (like 'vba1') or one or more eg. 'taxonKey=1234'.`)
    }
}

let tableSort = false;
async function setDataTable(columnIds={'Taxon Key':0,'Name':1,'Family':2,'Rank':3,'Common Name':4,'Image':5,'Last Observed':6}) {
    let columnDefs = [
        { orderSequence: ['desc', 'asc'], targets: [6] },
        { orderSequence: ['asc', 'desc'], targets: [1,2] }
    ]
    //tableSortHeavy(tableId='species-table', orderColumn[], excludeColumnIds=[],  columnDefs=[], limit=10, responsive=false, paging=false, searching=false, info=false)
    if (tableSort) {
        tableSort.clear();
        tableSort.destroy();
        tableSort = tableSortHeavy('speciesListTable', [6, 'desc'], [5], columnDefs, 100, true, true, true, true);
    } else {
        tableSort = tableSortHeavy('speciesListTable', [6, 'desc'], [5], columnDefs, 100, true, true, true, true);
    }
}
/* DEPRECATED in favor of direct call after awaiting all updates in pageLoad
    $('#speciesListTable').ready(function () {
        setDataTable()
    });
*/

